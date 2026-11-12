import AppKit
import CoreGraphics
import Foundation
import SwiftUI

final class CaptureModel: ObservableObject {
    static let defaultBaseURL = "https://savers-rebuild-preview-production.up.railway.app"
    private static let oldBaseURL = "https://savers-production.up.railway.app"

    @Published private(set) var image: NSImage?
    @Published private(set) var status = ""
    @Published private(set) var shortcut = CaptureShortcut.load()
    @Published private(set) var baseURL: String = {
        let saved = UserDefaults.standard.string(forKey: "saversBaseURL")
        return saved == nil || saved == oldBaseURL ? defaultBaseURL : saved!
    }()

    private var pngData: Data?
    var onCapture: (() -> Void)?
    var onOpenLarge: ((NSImage) -> Void)?
    var onNeedsRebuild: (() -> Void)?
    var onShortcutChange: ((CaptureShortcut) -> Bool)?
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

    func changeShortcut(_ proposed: CaptureShortcut) -> String {
        guard onShortcutChange?(proposed) == true else {
            return "That shortcut is already in use. Try another."
        }
        shortcut = proposed
        proposed.save()
        return "Shortcut saved"
    }

    func setCapturedImage(_ captured: CGImage) {
        let bitmap = NSBitmapImageRep(cgImage: captured)
        guard let data = bitmap.representation(using: .png, properties: [:]) else {
            status = "Could not prepare the screenshot."
            return
        }
        image = NSImage(cgImage: captured, size: NSSize(width: CGFloat(captured.width), height: CGFloat(captured.height)))
        pngData = data
        status = ""
        onCapture?()
    }

    var previewSize: NSSize {
        guard let image, image.size.width > 0, image.size.height > 0 else {
            return NSSize(width: 280, height: 170)
        }
        let aspect = image.size.width / image.size.height
        if aspect >= 1 {
            return NSSize(width: 280, height: max(112, min(220, 280 / aspect)))
        }
        return NSSize(width: max(112, min(280, 220 * aspect)), height: 220)
    }

    @discardableResult
    func importClipboardImage() -> Bool {
        guard let captured = NSImage(pasteboard: .general),
              let tiff = captured.tiffRepresentation,
              let bitmap = NSBitmapImageRep(data: tiff),
              let data = bitmap.representation(using: .png, properties: [:]) else {
            status = "Copy a screenshot to the clipboard first."
            return false
        }
        image = captured
        pngData = data
        status = ""
        onCapture?()
        return true
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
