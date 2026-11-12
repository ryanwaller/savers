import AppKit
import Foundation
import SwiftUI

final class CapturedScreenshot: ObservableObject, Identifiable {
    let id = UUID()
    let image: NSImage
    let pngData: Data
    @Published var status = ""

    init(image: NSImage, pngData: Data) {
        self.image = image
        self.pngData = pngData
    }

    var previewSize: NSSize {
        guard image.size.width > 0, image.size.height > 0 else {
            return NSSize(width: 280, height: 170)
        }
        let height = 280 * image.size.height / image.size.width
        return NSSize(width: 280, height: max(112, min(300, height)))
    }
}

final class CaptureModel: ObservableObject {
    static let defaultBaseURL = "https://savers-rebuild-preview-production.up.railway.app"
    private static let oldBaseURL = "https://savers-production.up.railway.app"

    private(set) var importError = ""
    private(set) var bridgeError = ""
    @Published var ensure2xOutput = UserDefaults.standard.bool(forKey: "ensure2xOutput") {
        didSet { UserDefaults.standard.set(ensure2xOutput, forKey: "ensure2xOutput") }
    }
    @Published private(set) var baseURL: String = {
        let saved = UserDefaults.standard.string(forKey: "saversBaseURL")
        return saved == nil || saved == oldBaseURL ? defaultBaseURL : saved!
    }()

    var onCapture: ((CapturedScreenshot) -> Void)?
    var onOpenLarge: ((NSImage) -> Void)?
    var onNeedsRebuild: (() -> Void)?
    private var didOpenRebuild = false
    lazy var bridge: RebuildBridge? = {
        do {
            let server = try RebuildBridge(baseURL: baseURL)
            return server
        } catch {
            bridgeError = "Could not start the local Rebuild connection."
            return nil
        }
    }()

    func startBridge() { _ = bridge }

    func openShortcutSettings() {
        guard let url = URL(string: "x-apple.systempreferences:com.apple.Keyboard-Settings.extension") else { return }
        NSWorkspace.shared.open(url)
    }

    @discardableResult
    func importClipboardImage() -> Bool {
        guard let captured = NSImage(pasteboard: .general),
              let tiff = captured.tiffRepresentation,
              let bitmap = NSBitmapImageRep(data: tiff),
              let data = pngData(from: bitmap, pointSize: captured.size) else {
            importError = "Copy a screenshot to the clipboard first."
            return false
        }
        importError = ""
        onCapture?(CapturedScreenshot(image: captured, pngData: data))
        return true
    }

    private func pngData(from bitmap: NSBitmapImageRep, pointSize: NSSize) -> Data? {
        guard ensure2xOutput else { return bitmap.representation(using: .png, properties: [:]) }
        let scale = max(1, max(
            pointSize.width * 2 / CGFloat(bitmap.pixelsWide),
            pointSize.height * 2 / CGFloat(bitmap.pixelsHigh)
        ))
        guard scale > 1 else { return bitmap.representation(using: .png, properties: [:]) }
        let targetWidth = Int(ceil(CGFloat(bitmap.pixelsWide) * scale))
        let targetHeight = Int(ceil(CGFloat(bitmap.pixelsHigh) * scale))
        guard
              let source = bitmap.cgImage,
              let context = CGContext(
                data: nil,
                width: targetWidth,
                height: targetHeight,
                bitsPerComponent: 8,
                bytesPerRow: 0,
                space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
              ) else {
            return bitmap.representation(using: .png, properties: [:])
        }
        context.interpolationQuality = .high
        context.draw(source, in: CGRect(x: 0, y: 0, width: targetWidth, height: targetHeight))
        guard let scaled = context.makeImage() else { return nil }
        return NSBitmapImageRep(cgImage: scaled).representation(using: .png, properties: [:])
    }

    @discardableResult
    func saveToDesktop(_ capture: CapturedScreenshot) -> Bool {
        guard let desktop = FileManager.default.urls(for: .desktopDirectory, in: .userDomainMask).first else {
            capture.status = "Could not find Desktop."
            return false
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
            try capture.pngData.write(to: destination, options: .atomic)
            return true
        } catch {
            capture.status = "Could not save to Desktop."
            return false
        }
    }

    func openLarger(_ capture: CapturedScreenshot) {
        onOpenLarge?(capture.image)
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
            return
        }
        NSWorkspace.shared.open(url)
        didOpenRebuild = true
    }

    @discardableResult
    func sendToRebuild(_ capture: CapturedScreenshot) -> Bool {
        guard let bridge else {
            capture.status = bridgeError.isEmpty ? "Could not connect to Rebuild." : bridgeError
            return false
        }
        do {
            try bridge.enqueue(capture.pngData)
            if !didOpenRebuild { onNeedsRebuild?() }
            return true
        } catch {
            capture.status = "Could not queue screenshot for Rebuild."
            return false
        }
    }
}
