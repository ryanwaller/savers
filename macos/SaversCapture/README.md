# Savers Capture for macOS

A small menu bar screenshot companion for Savers. Choose **Capture Area** or
**Capture Screen** from the menu bar icon. After the native macOS selection, a
compact preview appears at the bottom left with three actions:

- **Desktop** writes a PNG to the Desktop.
- **Open larger** opens a full-size resizable preview.
- **Send to Savers** uploads the PNG bytes directly. It does not save a local file
  or attach a URL.

The capture command uses the macOS `screencapture` tool with its clipboard option.
The first capture may prompt for Screen Recording permission. This app is intended
for macOS 13 or newer.

## Build and run

On a Mac with Xcode Command Line Tools installed:

```sh
cd macos/SaversCapture
./build-app.sh
open 'dist/Savers Capture.app'
```

The script creates a locally ad hoc signed app. Distribution to other Macs would
need a Developer ID signature and notarization.

## Connect Savers

1. Open the current Savers website and go to **Settings → API tokens**.
2. Create a token named **Mac Capture** and copy it when shown.
3. In the Savers Capture menu bar menu, open **Settings…** and paste the token.

The token is kept in the macOS Keychain. The default endpoint is the current
Savers service, `https://savers-production.up.railway.app`. Change the address
in Settings only if the target Savers service has the same authenticated image
upload API. The app sends to `POST /api/images/upload` and checks the response
before reporting success.

The rebuild preview keeps cards in browser-local storage, so native uploads do
not appear there yet. They appear in the current authenticated Savers account.

## Scope of this first version

This version uses native macOS area or screen selection and a lightweight Savers
preview. It does not add a button to CleanShot's overlay or replace CleanShot's
annotation, scrolling capture, OCR, or recording tools.
