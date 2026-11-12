# Savers Capture for macOS

Savers Capture is a compact menu bar screenshot companion for the **Rebuild preview**.
Press the Mac's built-in **Control–Shift–Command–4** shortcut to capture an area
to the clipboard, or **Control–Shift–Command–3** for the full screen. Savers
Capture notices the new clipboard image and opens a small image tile at the
bottom left. Hover over it to show three actions:

- **Desktop** saves a PNG on the Desktop.
- **Open** opens a larger, resizable view.
- **Rebuild** sends the screenshot to the Rebuild library in your browser.

The Rebuild preview stores cards in that browser. The Mac app opens it once with
a private pairing token, then hands screenshots over through a loopback-only
connection. Captures are queued in Application Support until the browser saves
them, and are then removed from the queue. Nothing is sent to the old Savers
service or saved to the Desktop when you choose Rebuild. If the browser tab is
closed, choose **Open Rebuild** from the menu bar later to finish the handoff.

The app reads the clipboard image after macOS captures it, so it does not need
Screen Recording permission. Images copied from CleanShot can also be brought
in with **Use Clipboard Image** in the menu bar. macOS 13 or newer is required.
This build is ad hoc signed and not notarized, so macOS may ask you to allow it
in **System Settings → Privacy & Security → Open Anyway**.

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
