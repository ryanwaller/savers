import AppKit
import QuartzCore
import SwiftUI

private struct PreviewEntry {
    let capture: CapturedScreenshot
    let panel: NSPanel
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
            styleMask: [.titled, .fullSizeContentView, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        panel.titleVisibility = .hidden
        panel.titlebarAppearsTransparent = true
        panel.standardWindowButton(.closeButton)?.isHidden = true
        panel.standardWindowButton(.miniaturizeButton)?.isHidden = true
        panel.standardWindowButton(.zoomButton)?.isHidden = true
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = true
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.contentView = NSHostingView(rootView: CapturePreview(
            capture: capture,
            close: { [weak self] in self?.removePreview(capture.id) },
            saveToDesktop: { [weak self] in
                guard let self, self.model.saveToDesktop(capture) else { return }
                self.removePreview(capture.id)
            },
            openLarger: { [weak self] in self?.model.openLarger(capture) },
            sendToRebuild: { [weak self] in
                guard let self, self.model.sendToRebuild(capture) else { return }
                self.removePreview(capture.id)
            }
        ))
        previews.append(PreviewEntry(capture: capture, panel: panel))
        layoutPreviews(animated: false)
        panel.orderFrontRegardless()
    }

    private func removePreview(_ id: UUID) {
        guard let index = previews.firstIndex(where: { $0.capture.id == id }) else { return }
        let entry = previews.remove(at: index)
        entry.panel.orderOut(nil)
        entry.panel.close()
        layoutPreviews(animated: true)
    }

    private func layoutPreviews(animated: Bool) {
        let screen = NSScreen.main ?? NSScreen.screens.first
        let frame = screen?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        var nextY = frame.minY + 16
        let updateFrames = {
            for entry in self.previews {
                var target = entry.panel.frame
                target.origin = NSPoint(x: frame.minX + 16, y: nextY)
                if animated {
                    entry.panel.animator().setFrame(target, display: true)
                } else {
                    entry.panel.setFrame(target, display: true)
                }
                nextY += target.height + 12
            }
        }
        if animated {
            NSAnimationContext.runAnimationGroup { context in
                context.duration = 0.22
                context.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
                updateFrames()
            }
        } else {
            updateFrames()
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
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 900, height: 650),
            styleMask: [.titled, .closable, .resizable, .miniaturizable],
            backing: .buffered,
            defer: false
        )
        window.title = "Screenshot"
        window.contentView = NSHostingView(rootView: LargerPreview(image: image))
        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        largerWindow = window
    }

    @objc private func showSettings() {
        if settingsWindow == nil {
            let window = NSWindow(
                contentRect: NSRect(x: 0, y: 0, width: 480, height: 340),
                styleMask: [.titled, .closable],
                backing: .buffered,
                defer: false
            )
            window.title = "Savers Capture Settings"
            window.contentView = NSHostingView(rootView: CaptureSettings(model: model))
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
