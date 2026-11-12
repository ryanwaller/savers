#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"
swift build -c release --product SaversCapture

app_path="$PWD/dist/Savers Capture.app"
rm -rf "$app_path"
mkdir -p "$app_path/Contents/MacOS"
cp .build/release/SaversCapture "$app_path/Contents/MacOS/SaversCapture"
cat > "$app_path/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>Savers Capture</string>
  <key>CFBundleDisplayName</key><string>Savers Capture</string>
  <key>CFBundleIdentifier</key><string>app.savers.capture</string>
  <key>CFBundleExecutable</key><string>SaversCapture</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>0.9.2</string>
  <key>CFBundleVersion</key><string>11</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>LSUIElement</key><true/>
  <key>NSHighResolutionCapable</key><true/>
</dict></plist>
PLIST

codesign --force --sign - "$app_path"
echo "Built $app_path"
