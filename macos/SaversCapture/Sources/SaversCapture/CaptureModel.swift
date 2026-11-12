import AppKit
import Foundation
import SwiftUI

final class CaptureModel: ObservableObject {
    static let defaultBaseURL = "https://savers-rebuild-preview-production.up.railway.app"
    private static let oldBaseURL = "https://savers-production.up.railway.app"

    @Published private(set) var image: NSImage?
    @Published private(set) var status = ""
    @Published private(set) var baseURL: String = {
        let saved = UserDefaults.standard.string(forKey: "saversBaseURL")
        return saved == nil || saved == oldBaseURL ? defaultBaseURL : saved!
    }()

    private var pngData: Data?
    var onCapture: (() -> Void)?
    var onOpenLarge: ((NSImage) -> Void)?
    var onNeedsRebuild: (() -> Void)?
    private var didOpenRebuild = false
    lazy var bridge: RebuildBridge? = {
        do {
            let server = try RebuildBridge(baseURL: baseURL)
            server.onAcknowledged = { [weak self] in
                DispatchQueue.main.async { self?.status = "Saved to Rebuild" }
            }
            return server
        } catch {
            status = "Could not start the local Rebuild connection."
            return nil
        }
    }()

    func startBridge() { _ = bridge }

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

    func configure(baseURL rawURL: String) -> String {
        let cleanURL = rawURL.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = URL(string: cleanURL), url.scheme == "https", url.host != nil,
              url.path.isEmpty || url.path == "/" else {
            return "Enter the HTTPS address of the Rebuild preview."
        }
        baseURL = cleanURL.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        UserDefaults.standard.set(baseURL, forKey: "saversBaseURL")
        bridge?.baseURL = baseURL
        didOpenRebuild = false
        return "Settings saved"
    }

    func openRebuild() {
        guard let bridge, let url = URL(string: "\(baseURL)/rebuild#savers-capture=\(bridge.token)") else {
            status = "Could not open Rebuild."
            return
        }
        NSWorkspace.shared.open(url)
        didOpenRebuild = true
    }

    func sendToRebuild() {
        guard let data = pngData else { return }
        guard let bridge else { return }
        do {
            try bridge.enqueue(data)
            status = "Waiting for Rebuild…"
            if !didOpenRebuild { onNeedsRebuild?() }
        } catch {
            status = "Could not queue screenshot for Rebuild."
        }
    }
}
