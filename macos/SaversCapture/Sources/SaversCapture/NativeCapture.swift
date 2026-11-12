import AppKit
import CoreGraphics

struct ScreenSnapshot {
    let screen: NSScreen
    let image: CGImage

    static func take() -> ScreenSnapshot? {
        let mouse = NSEvent.mouseLocation
        guard CGPreflightScreenCaptureAccess(),
              let screen = NSScreen.screens.first(where: { $0.frame.contains(mouse) }) ?? NSScreen.main,
              let number = screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber,
              let image = CGDisplayCreateImage(CGDirectDisplayID(number.uint32Value)) else { return nil }
        return ScreenSnapshot(screen: screen, image: image)
    }

    func crop(_ selection: NSRect) -> CGImage? {
        guard selection.width > 4, selection.height > 4 else { return nil }
        let scaleX = CGFloat(image.width) / screen.frame.width
        let scaleY = CGFloat(image.height) / screen.frame.height
        let pixels = CGRect(
            x: selection.minX * scaleX,
            y: (screen.frame.height - selection.maxY) * scaleY,
            width: selection.width * scaleX,
            height: selection.height * scaleY
        ).integral.intersection(CGRect(x: 0, y: 0, width: CGFloat(image.width), height: CGFloat(image.height)))
        guard pixels.width > 0, pixels.height > 0 else { return nil }
        return image.cropping(to: pixels)
    }
}

final class ScreenAreaPicker {
    private let snapshot: ScreenSnapshot
    private let window: SelectionWindow
    var onFinished: ((CGImage?) -> Void)?

    init(snapshot: ScreenSnapshot) {
        self.snapshot = snapshot
        window = SelectionWindow(
            contentRect: snapshot.screen.frame,
            styleMask: .borderless,
            backing: .buffered,
            defer: false
        )
        window.level = .screenSaver
        window.isOpaque = false
        window.backgroundColor = .clear
        window.hasShadow = false
        window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        let view = SelectionView(frame: NSRect(origin: .zero, size: snapshot.screen.frame.size))
        view.onFinished = { [weak self] selection in
            guard let self else { return }
            self.window.orderOut(nil)
            self.onFinished?(selection.flatMap { self.snapshot.crop($0) })
        }
        window.contentView = view
        NSApp.activate(ignoringOtherApps: true)
        window.makeKeyAndOrderFront(nil)
        window.makeFirstResponder(view)
        NSCursor.crosshair.set()
    }
}

private final class SelectionWindow: NSWindow {
    override var canBecomeKey: Bool { true }
}

private final class SelectionView: NSView {
    var onFinished: ((NSRect?) -> Void)?
    private var start: NSPoint?
    private var end: NSPoint?
    override var acceptsFirstResponder: Bool { true }

    override func draw(_ dirtyRect: NSRect) {
        NSColor.black.withAlphaComponent(0.14).setFill()
        NSRectFill(bounds)
        guard let selection else { return }
        NSColor.white.withAlphaComponent(0.12).setFill()
        NSRectFill(selection)
        NSColor.white.setStroke()
        let outline = NSBezierPath(rect: selection)
        outline.lineWidth = 2
        outline.stroke()
    }

    private var selection: NSRect? {
        guard let start, let end else { return nil }
        return NSRect(x: min(start.x, end.x), y: min(start.y, end.y),
                      width: abs(start.x - end.x), height: abs(start.y - end.y))
    }

    override func mouseDown(with event: NSEvent) {
        start = convert(event.locationInWindow, from: nil)
        end = start
        needsDisplay = true
    }

    override func mouseDragged(with event: NSEvent) {
        end = convert(event.locationInWindow, from: nil)
        needsDisplay = true
    }

    override func mouseUp(with event: NSEvent) {
        end = convert(event.locationInWindow, from: nil)
        onFinished?(selection)
    }

    override func keyDown(with event: NSEvent) {
        if event.keyCode == 53 { onFinished?(nil) }
    }
}
