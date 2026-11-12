import AppKit
import Foundation
import Security
import SwiftUI

private enum TokenVault {
    static let service = "app.savers.capture"
    static let account = "upload-token"

    static func read() -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecMatchLimit as String: kSecMatchLimitOne,
            kSecReturnData as String: true
        ]
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func save(_ token: String) -> Bool {
        let key: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        SecItemDelete(key as CFDictionary)
        var item = key
        item[kSecValueData as String] = Data(token.utf8)
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        return SecItemAdd(item as CFDictionary, nil) == errSecSuccess
    }
}

private struct UploadResponse: Decodable {
    struct ImageRow: Decodable { let id: String }
    struct UploadIssue: Decodable { let reason: String }
    let images: [ImageRow]?
    let errors: [UploadIssue]?
    let error: String?
}

final class CaptureModel: ObservableObject {
    static let defaultBaseURL = "https://savers-production.up.railway.app"

    @Published private(set) var image: NSImage?
    @Published private(set) var status = ""
    @Published private(set) var isSending = false
    @Published private(set) var hasToken = TokenVault.read() != nil
    @Published private(set) var baseURL = UserDefaults.standard.string(forKey: "saversBaseURL") ?? defaultBaseURL

    private var pngData: Data?
    var onCapture: (() -> Void)?
    var onOpenLarge: ((NSImage) -> Void)?

    func capture(area: Bool) {
        let pasteboard = NSPasteboard.general
        let previousChangeCount = pasteboard.changeCount
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
        process.arguments = area ? ["-i", "-c", "-t", "png"] : ["-c", "-t", "png"]
        process.terminationHandler = { [weak self] finished in
            DispatchQueue.main.async {
                guard finished.terminationStatus == 0,
                      pasteboard.changeCount != previousChangeCount,
                      let captured = NSImage(pasteboard: pasteboard),
                      let tiff = captured.tiffRepresentation,
                      let bitmap = NSBitmapImageRep(data: tiff),
                      let data = bitmap.representation(using: .png, properties: [:]) else { return }
                self?.image = captured
                self?.pngData = data
                self?.status = ""
                self?.onCapture?()
            }
        }
        do {
            try process.run()
        } catch {
            status = "Could not start screenshot capture."
        }
    }

    func saveToDesktop() {
        guard let data = pngData,
              let desktop = FileManager.default.urls(for: .desktopDirectory, in: .userDomainMask).first else {
            status = "No screenshot is ready."
            return
        }
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd 'at' HH.mm.ss"
        let stem = "Savers Screenshot \(formatter.string(from: Date()))"
        var destination = desktop.appendingPathComponent("\(stem).png")
        var suffix = 2
        while FileManager.default.fileExists(atPath: destination.path) {
            destination = desktop.appendingPathComponent("\(stem) \(suffix).png")
            suffix += 1
        }
        do {
            try data.write(to: destination, options: .atomic)
            status = "Saved to Desktop"
        } catch {
            status = "Could not save to Desktop."
        }
    }

    func openLarger() {
        guard let image else { return }
        onOpenLarge?(image)
    }

    func configure(baseURL rawURL: String, token rawToken: String) -> String {
        let cleanURL = rawURL.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = URL(string: cleanURL),
              url.scheme == "https", url.host != nil, url.path.isEmpty || url.path == "/" else {
            return "Enter the HTTPS address of Savers."
        }
        let token = rawToken.trimmingCharacters(in: .whitespacesAndNewlines)
        if !token.isEmpty && !TokenVault.save(token) { return "Could not save the token in Keychain." }
        baseURL = cleanURL.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        UserDefaults.standard.set(baseURL, forKey: "saversBaseURL")
        hasToken = TokenVault.read() != nil
        return "Settings saved"
    }

    func sendToSavers() {
        guard !isSending, let data = pngData else { return }
        guard let token = TokenVault.read(), !token.isEmpty else {
            status = "Add a Savers API token in Settings."
            return
        }
        guard let url = URL(string: baseURL + "/api/images/upload") else {
            status = "Check the Savers address in Settings."
            return
        }

        isSending = true
        status = "Sending…"
        let boundary = "SaversCapture-\(UUID().uuidString)"
        var body = Data()
        body.append(Data("--\(boundary)\r\n".utf8))
        body.append(Data("Content-Disposition: form-data; name=\"files\"; filename=\"Screenshot.png\"\r\n".utf8))
        body.append(Data("Content-Type: image/png\r\n\r\n".utf8))
        body.append(data)
        body.append(Data("\r\n--\(boundary)--\r\n".utf8))

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.httpBody = body
        request.timeoutInterval = 90
        URLSession.shared.dataTask(with: request) { [weak self] responseData, response, error in
            let payload = responseData.flatMap { try? JSONDecoder().decode(UploadResponse.self, from: $0) }
            let code = (response as? HTTPURLResponse)?.statusCode ?? 0
            DispatchQueue.main.async {
                guard let self else { return }
                self.isSending = false
                if code == 200, payload?.images?.isEmpty == false {
                    self.status = "Saved to Savers"
                } else if code == 401 {
                    self.status = "Token expired or revoked. Add a new one in Settings."
                } else {
                    self.status = payload?.errors?.first?.reason ?? payload?.error ?? error?.localizedDescription ?? "Could not send screenshot."
                }
            }
        }.resume()
    }
}
