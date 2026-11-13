import AppKit
import SwiftUI

private let saversGreen = Color(red: 185 / 255, green: 1, blue: 105 / 255)

struct CapturePreview: View {
    @ObservedObject var capture: CapturedScreenshot
    let close: () -> Void
    let saveToDesktop: () -> Bool
    let openLarger: () -> Void
    let copy: () -> Bool
    let sendToSavers: () -> Bool
    @State private var hovered = false
    @State private var dismissing = false

    var body: some View {
        let size = capture.previewSize
        return ZStack {
            Image(nsImage: capture.image)
                .resizable()
                .scaledToFill()
                .frame(width: size.width, height: size.height)
                .clipped()
                .blur(radius: hovered ? 18 : 0)
            if hovered {
                Color.black.opacity(0.42)
                HoverCopyButton {
                    if copy() { dismissPreview() }
                }
                VStack {
                    HStack {
                        HoverCircleButton(icon: "xmark", help: "Close preview", action: dismissPreview)
                        Spacer()
                        HoverCircleButton(icon: "arrow.down.to.line", help: "Save PNG to Desktop") {
                            if saveToDesktop() { dismissPreview() }
                        }
                    }
                    Spacer()
                    HStack {
                        HoverCircleButton(icon: "plus", help: "Open larger preview", action: openLarger)
                        Spacer()
                        HoverCircleButton(icon: "savers", help: "Send to Savers") {
                            if sendToSavers() { dismissPreview() }
                        }
                    }
                }
                .padding(9)
                .transition(.opacity)
                if !capture.status.isEmpty {
                    Text(capture.status)
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(.white)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(.black.opacity(0.55), in: Capsule())
                        .offset(y: 36)
                }
            }
        }
        .frame(width: size.width, height: size.height)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .scaleEffect(dismissing ? 0.82 : 1, anchor: .bottomLeading)
        .offset(y: dismissing ? 24 : 0)
        .opacity(dismissing ? 0 : 1)
        .allowsHitTesting(!dismissing)
        .onHover { hovered = $0 }
        .onChange(of: capture.dismissRequested) { requested in
            if requested { dismissPreview() }
        }
        .animation(.easeInOut(duration: 0.2), value: hovered)
        .animation(.easeIn(duration: 0.18), value: dismissing)
        .accessibilityLabel("Screenshot preview")
        .accessibilityHint("Press Escape to close or Return to copy. Hover for more actions.")
    }

    private func dismissPreview() {
        guard !dismissing else { return }
        dismissing = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2, execute: close)
    }
}

private struct HoverCircleButton: View {
    let icon: String
    let help: String
    let action: () -> Void
    @State private var hovered = false

    var body: some View {
        Button(action: action) {
            Group {
                if icon == "savers" {
                    SaversMark().frame(width: 22, height: 22)
                } else {
                    Image(systemName: icon)
                        .font(.system(size: 17, weight: .regular))
                }
            }
            .foregroundColor(.black)
            .frame(width: 42, height: 42)
            .background(hovered ? (icon == "savers" ? .white : saversGreen) : (icon == "savers" ? saversGreen : .white), in: Circle())
            .scaleEffect(hovered ? 1.08 : 1)
            .shadow(color: .black.opacity(hovered ? 0.18 : 0), radius: 5, y: 2)
        }
        .buttonStyle(.plain)
        .help(help)
        .accessibilityLabel(help)
        .onHover { hovered = $0 }
        .animation(.easeOut(duration: 0.14), value: hovered)
    }
}

private struct HoverCopyButton: View {
    let action: () -> Void
    @State private var hovered = false

    var body: some View {
        Button(action: action) {
            Text("Copy")
                .font(.system(size: 15, weight: .medium))
                .foregroundColor(.black)
                .padding(.horizontal, 20)
                .frame(height: 42)
                .background(hovered ? saversGreen : .white, in: Capsule())
                .scaleEffect(hovered ? 1.06 : 1)
                .shadow(color: .black.opacity(hovered ? 0.18 : 0), radius: 5, y: 2)
        }
        .buttonStyle(.plain)
        .help("Copy screenshot to clipboard")
        .accessibilityLabel("Copy screenshot to clipboard")
        .onHover { hovered = $0 }
        .animation(.easeOut(duration: 0.14), value: hovered)
    }
}

private struct SaversMark: View {
    var body: some View {
        Canvas { context, size in
            var rays = Path()
            let center = CGPoint(x: size.width / 2, y: size.height / 2)
            for index in 0..<8 {
                let angle = Double(index) * .pi / 4
                let dx = CGFloat(cos(angle))
                let dy = CGFloat(sin(angle))
                rays.move(to: CGPoint(x: center.x + dx * 2.5, y: center.y + dy * 2.5))
                rays.addLine(to: CGPoint(x: center.x + dx * 10, y: center.y + dy * 10))
            }
            context.stroke(rays, with: .color(.black), lineWidth: 1.8)
        }
    }
}

struct LargerPreview: View {
    let image: NSImage
    let size: NSSize
    let close: () -> Void
    @State private var hovered = false

    var body: some View {
        ZStack(alignment: .topLeading) {
            Image(nsImage: image)
                .resizable()
                .scaledToFill()
                .frame(width: size.width, height: size.height)
                .clipped()
            if hovered {
                HoverCircleButton(icon: "xmark", help: "Close larger preview", action: close)
                .padding(12)
            }
        }
        .frame(width: size.width, height: size.height)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .onHover { hovered = $0 }
        .onExitCommand(perform: close)
    }
}

struct CaptureSettings: View {
    @ObservedObject var model: CaptureModel
    @State private var address: String
    @State private var filenameTemplate: String
    @State private var feedback = ""

    init(model: CaptureModel) {
        self.model = model
        _address = State(initialValue: model.baseURL)
        _filenameTemplate = State(initialValue: model.filenameTemplate)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Savers Capture")
                .font(.system(size: 21, weight: .medium))
            Text("Copy a screenshot to the clipboard to open its preview and send it to Savers.")
                .font(.system(size: 13))
                .foregroundColor(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            VStack(alignment: .leading, spacing: 6) {
                Text("Screenshot shortcut")
                    .font(.system(size: 13, weight: .medium))
                Text("In macOS Keyboard Shortcuts → Screenshots, change “Copy picture of selected area to the clipboard.” Default: Control–Shift–Command–4.")
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                Button("Change in System Settings…") { model.openShortcutSettings() }
            }
            VStack(alignment: .leading, spacing: 5) {
                Toggle("Ensure 2× screenshot output", isOn: $model.ensure2xOutput)
                    .font(.system(size: 13, weight: .medium))
                Text("Retina captures are usually 2× already. Smaller images can be enlarged, but no detail is added.")
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            VStack(alignment: .leading, spacing: 5) {
                Text("Screenshot name")
                    .font(.system(size: 13, weight: .medium))
                TextField("Name template", text: $filenameTemplate)
                    .textFieldStyle(.roundedBorder)
                Text("Use {date} and {time}. Example: \(model.filenameExample(for: filenameTemplate))")
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            VStack(alignment: .leading, spacing: 5) {
                Text("Savers address")
                    .font(.system(size: 13, weight: .medium))
                TextField("https://…", text: $address)
                    .textFieldStyle(.roundedBorder)
            }
            Text(feedback.isEmpty ? " " : feedback)
                .font(.system(size: 12))
                .foregroundColor(.secondary)
                .frame(maxWidth: .infinity, alignment: .center)
            HStack {
                Spacer()
                Button("Save") { saveSettings() }
                Button("Open Savers") {
                    saveSettings()
                    if feedback == "Settings saved" { model.openSavers() }
                }
                .buttonStyle(.borderedProminent)
                .tint(saversGreen)
                Spacer()
            }
        }
        .frame(width: 432, alignment: .leading)
        .padding(24)
    }

    private func saveSettings() {
        model.filenameTemplate = filenameTemplate
        feedback = model.configure(baseURL: address)
    }
}
