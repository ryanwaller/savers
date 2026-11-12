import AppKit
import SwiftUI

final class CaptureAppDelegate: NSObject, NSApplicationDelegate {
    private let model = CaptureModel()
    private var statusItem: NSStatusItem?
    private var previewPanel: NSPanel?
    private var largerWindow: NSWindow?
    private var settingsWindow: NSWindow?
    private var clipboardTimer: Timer?
    private var lastPasteboardChangeCount = NSPasteboard.general.changeCount

    func applicationDidFinishLaunching(_ notification: Notification) {
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        item.button?.image = NSImage(systemSymbolName: "camera.viewfinder", accessibilityDescription: "Savers Capture")
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

        model.onCapture = { [weak self] in self?.showPreview() }
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

    private func showPreview() {
        if previewPanel == nil {
            let panel = NSPanel(
                contentRect: NSRect(origin: .zero, size: model.previewSize),
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
                model: model,
                close: { [weak self] in self?.previewPanel?.orderOut(nil) }
            ))
            previewPanel = panel
        }
        guard let panel = previewPanel else { return }
        panel.setContentSize(model.previewSize)
        let screen = NSScreen.main ?? NSScreen.screens.first
        let frame = screen?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        panel.setFrameOrigin(NSPoint(x: frame.minX + 16, y: frame.minY + 16))
        panel.orderFrontRegardless()
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
