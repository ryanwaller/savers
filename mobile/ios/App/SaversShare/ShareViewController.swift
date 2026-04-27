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

    private let card = UIView()
    private let label = UILabel()
    private let activity = UIActivityIndicatorView(style: .medium)

    override func viewDidLoad() {
        super.viewDidLoad()

        view.backgroundColor = UIColor.black.withAlphaComponent(0.4)

        card.translatesAutoresizingMaskIntoConstraints = false
        card.backgroundColor = UIColor(white: 0.07, alpha: 1.0)
        card.layer.cornerRadius = 14
        card.layer.cornerCurve = .continuous
        card.layer.borderWidth = 1
        card.layer.borderColor = UIColor(white: 0.18, alpha: 1.0).cgColor
        view.addSubview(card)

        label.translatesAutoresizingMaskIntoConstraints = false
        label.text = "Saving to Savers…"
        label.textColor = .white
        label.font = .systemFont(ofSize: 14, weight: .medium)
        label.textAlignment = .center
        label.numberOfLines = 0
        card.addSubview(label)

        activity.translatesAutoresizingMaskIntoConstraints = false
        activity.color = .white
        activity.startAnimating()
        card.addSubview(activity)

        NSLayoutConstraint.activate([
            card.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            card.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            card.widthAnchor.constraint(equalToConstant: 240),

            label.topAnchor.constraint(equalTo: card.topAnchor, constant: 18),
            label.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 16),
            label.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -16),

            activity.topAnchor.constraint(equalTo: label.bottomAnchor, constant: 12),
            activity.centerXAnchor.constraint(equalTo: card.centerXAnchor),
            activity.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -18),
        ])
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        Task { await self.handleShare() }
    }

    // MARK: - Share flow

    @MainActor
    private func handleShare() async {
        guard let url = await extractURL() else {
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
            try await postBookmark(url: url, title: nil, token: token)
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

    private func extractURL() async -> URL? {
        guard let item = (extensionContext?.inputItems.first as? NSExtensionItem),
              let attachments = item.attachments
        else { return nil }

        for provider in attachments {
            // Most modern share targets advertise the URL UTType.
            if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                if let url: URL = await loadItem(
                    from: provider, type: UTType.url.identifier
                ) {
                    return url
                }
            }
            // Some apps share plain text containing a URL (e.g. SMS).
            if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
                if let text: String = await loadItem(
                    from: provider, type: UTType.plainText.identifier
                ),
                    let url = URL(string: text.trimmingCharacters(in: .whitespacesAndNewlines))
                {
                    return url
                }
            }
        }
        return nil
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
        activity.stopAnimating()
        activity.isHidden = true
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

    private func postBookmark(url: URL, title: String?, token: String) async throws {
        guard let endpoint = URL(string: "\(Config.apiBase)/api/bookmarks") else {
            throw BookmarkSaveError.server("Invalid API base.")
        }

        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 15

        var body: [String: Any] = ["url": url.absoluteString]
        if let title { body["title"] = title }
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
