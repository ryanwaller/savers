# Savers Capture for macOS

Savers Capture is a compact menu bar screenshot companion for the **Rebuild preview**.
Press **Control–Option–Command–4** anywhere on the Mac to select a screen area, or
choose **Capture Area** or **Capture Screen** from the menu bar. A small image tile
appears at the bottom left. Hover over it to show three actions:

- **Desktop** saves a PNG on the Desktop.
- **Open** opens a larger, resizable view.
- **Rebuild** sends the screenshot to the Rebuild library in your browser.

The Rebuild preview stores cards in that browser. The Mac app opens it once with
a private pairing token, then hands screenshots over through a loopback-only
connection. Captures are queued in Application Support until the browser saves
them, and are then removed from the queue. Nothing is sent to the old Savers
service or saved to the Desktop when you choose Rebuild. If the browser tab is
closed, choose **Open Rebuild** from the menu bar later to finish the handoff.

The app uses macOS's `screencapture` command. The first capture may require
Screen Recording permission. macOS 13 or newer is required. This build is ad
hoc signed and not notarized, so macOS may ask you to allow it in **System
Settings → Privacy & Security → Open Anyway**.

## Build and run

On a Mac with Xcode Command Line Tools installed:

```sh
cd macos/SaversCapture
./build-app.sh
open 'dist/Savers Capture.app'
```

The default Rebuild address is
`https://savers-rebuild-preview-production.up.railway.app`. You can change it
in the menu bar's **Settings…** window. **Open Rebuild** pairs that browser with
the Mac app using a token stored in the app's preferences and browser storage.
The pairing token remains in the URL fragment only until the page loads.
