import AppKit
import QuartzCore
import SwiftUI

private struct PreviewEntry {
    let capture: CapturedScreenshot
    let panel: NSPanel
}

private final class ImageWindow: NSWindow {
    override var canBecomeKey: Bool { true }
}

final class CaptureAppDelegate: NSObject, NSApplicationDelegate {
    private let model = CaptureModel()
    private var statusItem: NSStatusItem?
    private var previews: [PreviewEntry] = []
    private var largerWindow: NSWindow?
    private var settingsWindow: NSWindow?
    private var clipboardTimer: Timer?
    private var lastPasteboardChangeCount = NSPasteboard.general.changeCount

    func applicationDidFinishLaunching(_ notification: Notification) {
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        item.button?.image = makeSaversMenuIcon()
        let menu = NSMenu()
        let hint = menu.addItem(withTitle: "Screenshot to Clipboard", action: nil, keyEquivalent: "")
        hint.isEnabled = false
        menu.addItem(withTitle: "Use Clipboard Image", action: #selector(importClipboardImage), keyEquivalent: "")
        menu.addItem(withTitle: "Change Screenshot Shortcut…", action: #selector(openShortcutSettings), keyEquivalent: "")
        menu.addItem(.separator())
        menu.addItem(withTitle: "Open Rebuild", action: #selector(openRebuild), keyEquivalent: "")
        menu.addItem(withTitle: "Settings…", action: #selector(showSettings), keyEquivalent: "")
        menu.addItem(.separator())
        menu.addItem(withTitle: "Quit Savers Capture", action: #selector(quit), keyEquivalent: "q")
        menu.items.forEach { $0.target = self }
        item.menu = menu
        statusItem = item

        model.onCapture = { [weak self] capture in self?.showPreview(capture) }
        model.onOpenLarge = { [weak self] image in self?.showLarger(image) }
        model.onNeedsRebuild = { [weak self] in self?.model.openRebuild() }
        model.startBridge()
        clipboardTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
            self?.checkClipboard()
        }
    }

    func applicationWillTerminate(_ notification: Notification) {
        clipboardTimer?.invalidate()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        false
    }

    private func checkClipboard() {
        let pasteboard = NSPasteboard.general
        guard pasteboard.changeCount != lastPasteboardChangeCount else { return }
        lastPasteboardChangeCount = pasteboard.changeCount
        if NSImage(pasteboard: pasteboard) != nil { model.importClipboardImage() }
    }

    @objc private func importClipboardImage() {
        lastPasteboardChangeCount = NSPasteboard.general.changeCount
        if !model.importClipboardImage() {
            let alert = NSAlert()
            alert.messageText = "No image on the clipboard"
            alert.informativeText = "Use your macOS screenshot-to-clipboard shortcut and select an area. Savers Capture will open the preview automatically."
            alert.runModal()
        }
    }

    @objc private func openShortcutSettings() { model.openShortcutSettings() }

    private func showPreview(_ capture: CapturedScreenshot) {
        let panel = NSPanel(
            contentRect: NSRect(origin: .zero, size: capture.previewSize),
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = true
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.contentView = NSHostingView(rootView: CapturePreview(
            capture: capture,
            close: { [weak self] in self?.removePreview(capture.id) },
            saveToDesktop: { [weak self] in
                self?.model.saveToDesktop(capture) ?? false
            },
            openLarger: { [weak self] in self?.model.openLarger(capture) },
            copy: { [weak self] in self?.copyCapture(capture) ?? false },
            sendToRebuild: { [weak self] in
                self?.model.sendToRebuild(capture) ?? false
            }
        ))
        previews.append(PreviewEntry(capture: capture, panel: panel))
        if let target = previewFrames()[capture.id] {
            panel.setFrame(target, display: true)
        }
        panel.orderFrontRegardless()
    }

    private func copyCapture(_ capture: CapturedScreenshot) -> Bool {
        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        let outputImage = NSImage(data: capture.pngData) ?? capture.image
        guard pasteboard.writeObjects([outputImage]) else {
            capture.status = "Could not copy screenshot."
            return false
        }
        // Our clipboard watcher must not treat this copy as a new screenshot.
        lastPasteboardChangeCount = pasteboard.changeCount
        return true
    }

    private func removePreview(_ id: UUID) {
        guard let index = previews.firstIndex(where: { $0.capture.id == id }) else { return }
        let entry = previews.remove(at: index)
        entry.panel.orderOut(nil)
        entry.panel.close()
        layoutPreviews()
    }

    private func previewFrames() -> [UUID: NSRect] {
        let screen = NSScreen.main ?? NSScreen.screens.first
        let frame = screen?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        let inset: CGFloat = 16
        let gap: CGFloat = 12
        var nextX = frame.minX + inset
        var nextY = frame.minY + 16
        var targets: [UUID: NSRect] = [:]
        for entry in previews {
            let size = entry.capture.previewSize
            if nextY > frame.minY + inset && nextY + size.height > frame.maxY - inset {
                nextX += size.width + gap
                nextY = frame.minY + inset
            }
            targets[entry.capture.id] = NSRect(origin: NSPoint(x: nextX, y: nextY), size: size)
            nextY += size.height + gap
        }
        return targets
    }

    private func layoutPreviews() {
        let targets = previewFrames()
        NSAnimationContext.runAnimationGroup { context in
            context.duration = 0.2
            context.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
            for entry in previews {
                guard let target = targets[entry.capture.id] else { continue }
                entry.panel.animator().setFrame(target, display: true)
            }
        }
    }

    private func makeSaversMenuIcon() -> NSImage {
        let icon = NSImage(size: NSSize(width: 18, height: 18), flipped: false) { _ in
            let rays = NSBezierPath()
            for index in 0..<8 {
                let angle = CGFloat(index) * .pi / 4
                let dx = cos(angle)
                let dy = sin(angle)
                rays.move(to: NSPoint(x: 9 + dx * 2, y: 9 + dy * 2))
                rays.line(to: NSPoint(x: 9 + dx * 8, y: 9 + dy * 8))
            }
            rays.lineWidth = 1.8
            rays.lineCapStyle = .round
            NSColor.black.setStroke()
            rays.stroke()
            return true
        }
        icon.isTemplate = true
        icon.accessibilityDescription = "Savers Capture"
        return icon
    }

    @objc private func openRebuild() { model.openRebuild() }

    private func showLarger(_ image: NSImage) {
        dismissLarger()
        let screen = NSScreen.main ?? NSScreen.screens.first
        let visible = screen?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        let natural = image.size
        let width = max(1, natural.width)
        let height = max(1, natural.height)
        let scale = min(2, min((visible.width - 80) / width, (visible.height - 80) / height))
        let size = NSSize(width: width * scale, height: height * scale)
        let window = ImageWindow(
            contentRect: NSRect(origin: .zero, size: size),
            styleMask: [.borderless],
            backing: .buffered,
            defer: false
        )
        window.isOpaque = false
        window.backgroundColor = .clear
        window.hasShadow = true
        window.isMovableByWindowBackground = true
        window.contentView = NSHostingView(rootView: LargerPreview(image: image, size: size) { [weak self] in
            self?.dismissLarger()
        })
        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        largerWindow = window
    }

    private func dismissLarger() {
        guard let window = largerWindow else { return }
        largerWindow = nil
        // Hide after the button event returns, so SwiftUI does not lose its
        // hosting window while handling the close action.
        DispatchQueue.main.async { window.orderOut(nil) }
    }

    @objc private func showSettings() {
        if settingsWindow == nil {
            let window = NSWindow(
                contentRect: NSRect(x: 0, y: 0, width: 480, height: 480),
                styleMask: [.titled, .closable],
                backing: .buffered,
                defer: false
            )
            window.title = "Savers Capture Settings"
            let content = NSHostingView(rootView: CaptureSettings(model: model))
            window.contentView = content
            window.setContentSize(NSSize(width: 480, height: content.fittingSize.height))
            window.center()
            settingsWindow = window
        }
        settingsWindow?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    @objc private func quit() { NSApp.terminate(nil) }
}

let app = NSApplication.shared
let delegate = CaptureAppDelegate()
app.setActivationPolicy(.accessory)
app.delegate = delegate
app.run()
