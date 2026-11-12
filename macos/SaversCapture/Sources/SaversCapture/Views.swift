import AppKit
import SwiftUI

private let saversGreen = Color(red: 185 / 255, green: 1, blue: 105 / 255)

struct CapturePreview: View {
    @ObservedObject var model: CaptureModel
    let close: () -> Void
    let openSettings: () -> Void

    var body: some View {
        VStack(spacing: 12) {
            HStack {
                Text("Screenshot")
                    .font(.system(size: 15, weight: .medium))
                Spacer()
                Button(action: close) { Image(systemName: "xmark") }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Close preview")
            }
            .foregroundColor(.black.opacity(0.82))

            Group {
                if let image = model.image {
                    Image(nsImage: image)
                        .resizable()
                        .scaledToFit()
                } else {
                    Image(systemName: "photo")
                        .font(.system(size: 32, weight: .ultraLight))
                        .foregroundColor(.gray)
                }
            }
            .frame(maxWidth: .infinity)
            .frame(height: 150)
            .background(Color.black.opacity(0.045))
            .clipShape(RoundedRectangle(cornerRadius: 14))

            HStack(spacing: 8) {
                Button("Desktop") { model.saveToDesktop() }
                    .help("Save a PNG to Desktop")
                Button("Open larger") { model.openLarger() }
                Button(model.isSending ? "Sending…" : "Send to Savers") {
                    if model.hasToken { model.sendToSavers() } else { openSettings() }
                }
                .disabled(model.isSending)
                .buttonStyle(CaptureButtonStyle(isPrimary: true))
            }
            .buttonStyle(CaptureButtonStyle())

            Text(model.status.isEmpty ? " " : model.status)
                .font(.system(size: 11))
                .foregroundColor(model.status.hasPrefix("Could not") ? .red : .secondary)
                .lineLimit(2)
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityLabel(model.status)
        }
        .padding(16)
        .frame(width: 370, height: 280)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 22))
    }
}

private struct CaptureButtonStyle: ButtonStyle {
    var isPrimary = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 12, weight: .medium))
            .foregroundColor(Color.black.opacity(0.88))
            .padding(.horizontal, 11)
            .frame(height: 38)
            .background(isPrimary ? saversGreen : Color.black.opacity(0.055))
            .clipShape(Capsule())
            .opacity(configuration.isPressed ? 0.7 : 1)
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
    @State private var token = ""
    @State private var feedback = ""

    init(model: CaptureModel) {
        self.model = model
        _address = State(initialValue: model.baseURL)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("Savers Capture")
                .font(.system(size: 23, weight: .medium))
            Text("Connect once, then send screenshots directly to Savers. The API token stays in this Mac’s Keychain.")
                .font(.system(size: 13))
                .foregroundColor(.secondary)
            VStack(alignment: .leading, spacing: 7) {
                Text("Savers address")
                TextField("https://savers-production.up.railway.app", text: $address)
                    .textFieldStyle(.roundedBorder)
            }
            VStack(alignment: .leading, spacing: 7) {
                Text(model.hasToken ? "Replace API token" : "API token")
                SecureField(model.hasToken ? "Leave blank to keep current token" : "Paste token from Savers Settings", text: $token)
                    .textFieldStyle(.roundedBorder)
            }
            HStack {
                Text(feedback)
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
                Spacer()
                Button("Save settings") {
                    feedback = model.configure(baseURL: address, token: token)
                    if feedback == "Settings saved" { token = "" }
                }
                .buttonStyle(.borderedProminent)
                .tint(saversGreen)
            }
        }
        .padding(28)
        .frame(width: 480)
    }
}
