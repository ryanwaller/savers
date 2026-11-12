import AppKit
import Carbon
import SwiftUI

struct CaptureShortcut: Codable, Equatable {
    let keyCode: UInt32
    let modifiers: UInt32
    let label: String

    static let `default` = CaptureShortcut(
        keyCode: UInt32(kVK_ANSI_4),
        modifiers: UInt32(controlKey | optionKey | cmdKey),
        label: "⌃⌥⌘4"
    )

    init(keyCode: UInt32, modifiers: UInt32, label: String) {
        self.keyCode = keyCode
        self.modifiers = modifiers
        self.label = label
    }

    init?(event: NSEvent) {
        let flags = event.modifierFlags.intersection([.control, .option, .command, .shift])
        guard flags.contains(.control) || flags.contains(.option) || flags.contains(.command),
              let key = event.charactersIgnoringModifiers?.uppercased(), !key.isEmpty else { return nil }
        var carbon: UInt32 = 0
        var text = ""
        if flags.contains(.control) { carbon |= UInt32(controlKey); text += "⌃" }
        if flags.contains(.option) { carbon |= UInt32(optionKey); text += "⌥" }
        if flags.contains(.shift) { carbon |= UInt32(shiftKey); text += "⇧" }
        if flags.contains(.command) { carbon |= UInt32(cmdKey); text += "⌘" }
        self.init(keyCode: UInt32(event.keyCode), modifiers: carbon, label: text + key)
    }

    static func load() -> CaptureShortcut {
        guard let data = UserDefaults.standard.data(forKey: "captureShortcut"),
              let saved = try? JSONDecoder().decode(CaptureShortcut.self, from: data) else { return .default }
        return saved
    }

    func save() {
        if let data = try? JSONEncoder().encode(self) {
            UserDefaults.standard.set(data, forKey: "captureShortcut")
        }
    }
}

final class CaptureHotKey {
    var onPressed: (() -> Void)?
    private var handler: EventHandlerRef?
    private var hotKey: EventHotKeyRef?
    private var current: CaptureShortcut?

    init() {
        var eventType = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
        let callback: EventHandlerUPP = { _, _, userData in
            guard let userData else { return noErr }
            let manager = Unmanaged<CaptureHotKey>.fromOpaque(userData).takeUnretainedValue()
            DispatchQueue.main.async { manager.onPressed?() }
            return noErr
        }
        InstallEventHandler(GetApplicationEventTarget(), callback, 1, &eventType,
                            Unmanaged.passUnretained(self).toOpaque(), &handler)
    }

    @discardableResult
    func register(_ shortcut: CaptureShortcut) -> Bool {
        if let hotKey { UnregisterEventHotKey(hotKey); self.hotKey = nil }
        let hotKeyID = EventHotKeyID(signature: 0x53565243, id: 1)
        let result = RegisterEventHotKey(shortcut.keyCode, shortcut.modifiers,
                                         hotKeyID, GetApplicationEventTarget(), 0, &hotKey)
        if result == noErr {
            current = shortcut
            return true
        }
        if let current {
            RegisterEventHotKey(current.keyCode, current.modifiers,
                                hotKeyID, GetApplicationEventTarget(), 0, &hotKey)
        }
        return false
    }

    deinit {
        if let hotKey { UnregisterEventHotKey(hotKey) }
        if let handler { RemoveEventHandler(handler) }
    }
}

struct ShortcutRecorder: NSViewRepresentable {
    let shortcut: CaptureShortcut
    let onChange: (CaptureShortcut) -> Void

    func makeNSView(context: Context) -> ShortcutRecordingView {
        let view = ShortcutRecordingView(frame: .zero)
        view.onChange = onChange
        view.show(shortcut)
        return view
    }

    func updateNSView(_ view: ShortcutRecordingView, context: Context) {
        view.onChange = onChange
        if !view.isRecording { view.show(shortcut) }
    }
}

final class ShortcutRecordingView: NSView {
    var onChange: ((CaptureShortcut) -> Void)?
    private let text = NSTextField(labelWithString: "")
    private(set) var isRecording = false

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        wantsLayer = true
        layer?.cornerRadius = 9
        layer?.backgroundColor = NSColor.controlBackgroundColor.cgColor
        text.alignment = .center
        text.font = .systemFont(ofSize: 13, weight: .medium)
        text.frame = bounds
        text.autoresizingMask = [.width, .height]
        addSubview(text)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
    override var acceptsFirstResponder: Bool { true }

    func show(_ shortcut: CaptureShortcut) { text.stringValue = shortcut.label }

    override func mouseDown(with event: NSEvent) {
        window?.makeFirstResponder(self)
        isRecording = true
        text.stringValue = "Press a shortcut…"
    }

    override func keyDown(with event: NSEvent) {
        if event.keyCode == UInt16(kVK_Escape) {
            isRecording = false
            text.stringValue = "Click to record"
            return
        }
        guard let shortcut = CaptureShortcut(event: event) else { return }
        isRecording = false
        show(shortcut)
        onChange?(shortcut)
    }
}
