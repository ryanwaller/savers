import AppKit
import SwiftUI

final class CaptureAppDelegate: NSObject, NSApplicationDelegate {
    private let model = CaptureModel()
    private var statusItem: NSStatusItem?
    private var previewPanel: NSPanel?
    private var largerWindow: NSWindow?
    private var settingsWindow: NSWindow?

    func applicationDidFinishLaunching(_ notification: Notification) {
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        item.button?.image = NSImage(systemSymbolName: "camera.viewfinder", accessibilityDescription: "Savers Capture")
        let menu = NSMenu()
        menu.addItem(withTitle: "Capture Area", action: #selector(captureArea), keyEquivalent: "")
        menu.addItem(withTitle: "Capture Screen", action: #selector(captureScreen), keyEquivalent: "")
        menu.addItem(.separator())
        menu.addItem(withTitle: "Settings…", action: #selector(showSettings), keyEquivalent: "")
        menu.addItem(.separator())
        menu.addItem(withTitle: "Quit Savers Capture", action: #selector(quit), keyEquivalent: "q")
        menu.items.forEach { $0.target = self }
        item.menu = menu
        statusItem = item

        model.onCapture = { [weak self] in self?.showPreview() }
        model.onOpenLarge = { [weak self] image in self?.showLarger(image) }
    }

    @objc private func captureArea() {
        previewPanel?.orderOut(nil)
        model.capture(area: true)
    }

    @objc private func captureScreen() {
        previewPanel?.orderOut(nil)
        model.capture(area: false)
    }

    private func showPreview() {
        if previewPanel == nil {
            let panel = NSPanel(
                contentRect: NSRect(x: 0, y: 0, width: 370, height: 280),
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
                close: { [weak self] in self?.previewPanel?.orderOut(nil) },
                openSettings: { [weak self] in self?.showSettings() }
            ))
            previewPanel = panel
        }
        guard let panel = previewPanel else { return }
        let screen = NSScreen.main ?? NSScreen.screens.first
        let frame = screen?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        panel.setFrameOrigin(NSPoint(x: frame.minX + 24, y: frame.minY + 24))
        panel.orderFrontRegardless()
    }

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
                contentRect: NSRect(x: 0, y: 0, width: 480, height: 300),
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
