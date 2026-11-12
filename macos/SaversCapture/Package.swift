// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "SaversCapture",
    platforms: [.macOS(.v13)],
    products: [.executable(name: "SaversCapture", targets: ["SaversCapture"])],
    targets: [.executableTarget(name: "SaversCapture")]
)
