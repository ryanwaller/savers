import AppKit
import SwiftUI

private let saversGreen = Color(red: 185 / 255, green: 1, blue: 105 / 255)

struct CapturePreview: View {
    @ObservedObject var model: CaptureModel
    let close: () -> Void
    let openSettings: () -> Void
    @State private var hovered = false

    var body: some View {
        ZStack {
            Color(white: 0.14)
            if let image = model.image {
                Image(nsImage: image)
                    .resizable()
                    .scaledToFit()
                    .frame(width: 278, height: 190)
            }
            if hovered {
                Color.black.opacity(0.52)
                VStack(alignment: .leading, spacing: 0) {
                    HStack {
                        Button(action: close) { Image(systemName: "xmark") }
                            .help("Close preview")
                        Spacer()
                        if !model.status.isEmpty {
                            Text(model.status)
                                .font(.system(size: 10, weight: .medium))
                                .lineLimit(2)
                                .multilineTextAlignment(.trailing)
                        }
                    }
                    Spacer()
                    HStack(spacing: 6) {
                        Button("Desktop") { model.saveToDesktop() }
                            .help("Save PNG to Desktop")
                        Button("Open") { model.openLarger() }
                            .help("Open a larger preview")
                        Button("Rebuild") { model.sendToRebuild() }
                            .help("Send to the Rebuild library")
                            .disabled(model.status == "Waiting for Rebuild…")
                    }
                }
                .padding(10)
                .buttonStyle(HoverButtonStyle())
                .foregroundColor(.white)
            }
        }
        .frame(width: 278, height: 190)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .onHover { hovered = $0 }
        .accessibilityLabel("Screenshot preview")
        .accessibilityHint("Hover for Desktop, Open, and Rebuild actions")
    }
}

private struct HoverButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 11, weight: .medium))
            .foregroundColor(.black.opacity(0.85))
            .padding(.horizontal, 11)
            .frame(height: 29)
            .background(Color.white.opacity(configuration.isPressed ? 0.7 : 0.94))
            .clipShape(Capsule())
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
            Text("Screenshots go to your Rebuild preview in this browser. Open Rebuild once to connect it to this Mac.")
                .font(.system(size: 13))
                .foregroundColor(.secondary)
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
