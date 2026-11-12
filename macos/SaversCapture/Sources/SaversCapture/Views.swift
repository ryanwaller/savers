import AppKit
import SwiftUI

private let saversGreen = Color(red: 185 / 255, green: 1, blue: 105 / 255)

struct CapturePreview: View {
    @ObservedObject var capture: CapturedScreenshot
    let close: () -> Void
    let saveToDesktop: () -> Void
    let openLarger: () -> Void
    let sendToRebuild: () -> Void
    @State private var hovered = false

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
                VStack {
                    HStack {
                        cornerButton("xmark", help: "Close preview", action: close)
                        Spacer()
                        cornerButton("arrow.down.to.line", help: "Save PNG to Desktop", action: saveToDesktop)
                    }
                    Spacer()
                    if !capture.status.isEmpty {
                        Text(capture.status)
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(.white)
                            .multilineTextAlignment(.center)
                            .lineLimit(2)
                    }
                    Spacer()
                    HStack {
                        cornerButton("plus", help: "Open larger preview", action: openLarger)
                        Spacer()
                        Button(action: sendToRebuild) {
                            SaversMark()
                                .frame(width: 22, height: 22)
                                .frame(width: 42, height: 42)
                                .background(saversGreen, in: Circle())
                        }
                        .buttonStyle(.plain)
                        .help("Send to Rebuild")
                        .accessibilityLabel("Send to Rebuild")
                    }
                }
                .padding(9)
                .transition(.opacity)
            }
        }
        .frame(width: size.width, height: size.height)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .onHover { hovered = $0 }
        .animation(.easeInOut(duration: 0.2), value: hovered)
        .accessibilityLabel("Screenshot preview")
        .accessibilityHint("Hover for close, desktop, open, and Rebuild actions")
    }

    private func cornerButton(_ icon: String, help: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 17, weight: .regular))
                .foregroundColor(.black)
                .frame(width: 42, height: 42)
                .background(.white, in: Circle())
        }
        .buttonStyle(.plain)
        .help(help)
        .accessibilityLabel(help)
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

    var body: some View {
        Image(nsImage: image)
            .resizable()
            .scaledToFit()
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .padding(24)
            .background(Color.black.opacity(0.9))
    }
}

struct CaptureSettings: View {
    @ObservedObject var model: CaptureModel
    @State private var address: String
    @State private var feedback = ""

    init(model: CaptureModel) {
        self.model = model
        _address = State(initialValue: model.baseURL)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Savers Capture")
                .font(.system(size: 23, weight: .medium))
            Text("Copy a screenshot to the clipboard. Its preview opens here automatically, ready to send to Rebuild.")
                .font(.system(size: 13))
                .foregroundColor(.secondary)
            VStack(alignment: .leading, spacing: 7) {
                Text("Screenshot shortcut")
                    .font(.system(size: 13, weight: .medium))
                Text("In macOS Keyboard Shortcuts → Screenshots, change “Copy picture of selected area to the clipboard.” The default is Control–Shift–Command–4.")
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
                Button("Change in System Settings…") { model.openShortcutSettings() }
            }
            TextField("Rebuild address", text: $address)
                .textFieldStyle(.roundedBorder)
            HStack {
                Text(feedback)
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
                Spacer()
                Button("Save") { feedback = model.configure(baseURL: address) }
                Button("Open Rebuild") {
                    feedback = model.configure(baseURL: address)
                    if feedback == "Settings saved" { model.openRebuild() }
                }
                .buttonStyle(.borderedProminent)
                .tint(saversGreen)
            }
        }
        .padding(28)
        .frame(width: 480)
    }
}
