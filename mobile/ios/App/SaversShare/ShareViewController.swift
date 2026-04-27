// ShareViewController.swift
// SaversShare (iOS Share Extension target)
//
// Handles iOS Share Sheet "Savers" taps. Pulls the shared URL from the
// extension context, POSTs to /api/bookmarks with the user's API token,
// briefly shows the result, and dismisses. v1 is "quick save" — no
// in-extension editing. The Hybrid edit-toast lives in the main app.

import UIKit
import UniformTypeIdentifiers
import MobileCoreServices

final class ShareViewController: UIViewController {
    // MARK: - UI

    private let blurView = UIVisualEffectView(effect: UIBlurEffect(style: .systemUltraThinMaterialDark))
    private let label = UILabel()

    override func viewDidLoad() {
        super.viewDidLoad()

        // Make the entire backdrop a soft blur instead of an opaque black
        // overlay; the user can still see the host app underneath.
        view.backgroundColor = .clear
        blurView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(blurView)

        label.translatesAutoresizingMaskIntoConstraints = false
        label.text = "Saving to Savers…"
        label.textColor = .white
        label.font = .systemFont(ofSize: 16, weight: .semibold)
        label.textAlignment = .center
        label.numberOfLines = 0
        view.addSubview(label)

        NSLayoutConstraint.activate([
            blurView.topAnchor.constraint(equalTo: view.topAnchor),
            blurView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            blurView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            blurView.trailingAnchor.constraint(equalTo: view.trailingAnchor),

            label.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            label.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            label.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 32),
            label.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -32),
        ])
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        Task { await self.handleShare() }
    }

    // MARK: - Share flow

    @MainActor
    private func handleShare() async {
        let payload = await extractShareContent()
        guard let url = payload.url else {
            await showFinal(message: "No URL found in this share.", isError: true)
            return
        }

        // v1: token is hardcoded in Config.swift for personal sideload.
        // TokenStore is the v2 path — when we add a setup UI we'll prefer
        // the shared keychain over Config.
        let token = TokenStore.read() ?? Config.apiToken
        guard !token.isEmpty else {
            await showFinal(
                message:
                    "No token configured. Open Config.swift, paste a token from the Savers web Settings, and rebuild.",
                isError: true
            )
            return
        }

        do {
            try await postBookmark(
                url: url,
                title: payload.title,
                description: payload.description,
                token: token
            )
            await showFinal(message: "Saved.", isError: false)
        } catch BookmarkSaveError.unauthorized {
            await showFinal(
                message: "Token rejected. Add a fresh one in the Savers app.",
                isError: true
            )
        } catch BookmarkSaveError.duplicate {
            await showFinal(message: "Already saved.", isError: false)
        } catch {
            await showFinal(
                message: "Couldn't save: \(error.localizedDescription)",
                isError: true
            )
        }
    }

    struct ShareContent {
        var url: URL?
        var title: String?
        var description: String?
    }

    private func extractShareContent() async -> ShareContent {
        var result = ShareContent()
        guard let items = extensionContext?.inputItems as? [NSExtensionItem] else {
            return result
        }

        // Some hosts (Instagram, Threads, Twitter/X) provide the post's
        // caption / description as the NSExtensionItem's `attributedTitle`
        // or `contentText`, plus the URL as a separate attachment. Capture
        // the text first so we can fall back to it if the URL itself
        // doesn't yield a good title.
        for item in items {
            if let attributed = item.attributedContentText?.string,
               !attributed.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
               result.description == nil {
                result.description = attributed
            }
            if let attributedTitle = item.attributedTitle?.string,
               !attributedTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
               result.title == nil {
                result.title = attributedTitle
            }
            // attributedContentText is not always populated — some hosts use
            // userInfo instead.
            if let userInfo = item.userInfo,
               result.description == nil,
               let text = userInfo["NSExtensionItemAttributedContentTextKey"] as? String,
               !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                result.description = text
            }

            for provider in item.attachments ?? [] {
                if result.url == nil,
                   provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                    if let u: URL = await loadItem(
                        from: provider, type: UTType.url.identifier
                    ) {
                        result.url = u
                    }
                }

                if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
                    if let text: String = await loadItem(
                        from: provider, type: UTType.plainText.identifier
                    ) {
                        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
                        if result.url == nil,
                           let u = URL(string: trimmed),
                           ["http", "https"].contains((u.scheme ?? "").lowercased()) {
                            result.url = u
                        } else if !trimmed.isEmpty {
                            // Treat free-form text as the description if we
                            // don't have one yet — Instagram captions land
                            // here.
                            if result.description == nil {
                                result.description = trimmed
                            }
                        }
                    }
                }
            }
        }

        // Promote the first line of the description into a title when the
        // host didn't supply one explicitly. Most apps share captions like
        // "Big news! …\n\nReally exciting stuff.\n\nhttps://example.com" —
        // first line is a usable headline.
        if result.title == nil, let desc = result.description {
            let firstLine = desc.split(whereSeparator: \.isNewline).first.map(String.init) ?? desc
            let cleaned = firstLine
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .prefix(140)
            if !cleaned.isEmpty {
                result.title = String(cleaned)
            }
        }

        return result
    }

    private func loadItem<T>(from provider: NSItemProvider, type: String) async -> T? {
        await withCheckedContinuation { continuation in
            provider.loadItem(forTypeIdentifier: type, options: nil) { value, _ in
                if let direct = value as? T {
                    continuation.resume(returning: direct)
                    return
                }
                // URL items sometimes arrive as Data when crossing process boundaries.
                if T.self == URL.self,
                    let data = value as? Data,
                    let str = String(data: data, encoding: .utf8),
                    let url = URL(string: str)
                {
                    continuation.resume(returning: url as? T)
                    return
                }
                continuation.resume(returning: nil)
            }
        }
    }

    @MainActor
    private func showFinal(message: String, isError: Bool) async {
        label.text = message
        label.textColor = isError ? UIColor(red: 1.0, green: 0.5, blue: 0.5, alpha: 1.0) : .white

        // Linger for a moment so the user actually sees the result, then dismiss.
        try? await Task.sleep(nanoseconds: isError ? 1_400_000_000 : 700_000_000)
        extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
    }

    // MARK: - Network

    enum BookmarkSaveError: Error {
        case unauthorized
        case duplicate
        case server(String)
    }

    private func postBookmark(
        url: URL,
        title: String?,
        description: String?,
        token: String
    ) async throws {
        guard let endpoint = URL(string: "\(Config.apiBase)/api/bookmarks") else {
            throw BookmarkSaveError.server("Invalid API base.")
        }

        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 15

        var body: [String: Any] = ["url": url.absoluteString]
        if let title, !title.isEmpty { body["title"] = title }
        if let description, !description.isEmpty {
            body["description"] = description
            // Also store as notes — captions from social shares often
            // contain enough context that the user wants to keep around
            // verbatim, not just as a 1-line description.
            body["notes"] = description
        }
        request.httpBody = try JSONSerialization.data(withJSONObject: body, options: [])

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw BookmarkSaveError.server("Unexpected response.")
        }

        if http.statusCode == 401 {
            throw BookmarkSaveError.unauthorized
        }

        if http.statusCode == 409 {
            throw BookmarkSaveError.duplicate
        }

        if !(200..<300).contains(http.statusCode) {
            let bodyMessage =
                (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            let message = (bodyMessage?["error"] as? String) ?? "HTTP \(http.statusCode)"
            throw BookmarkSaveError.server(message)
        }
    }
}
