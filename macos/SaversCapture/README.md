# Savers Capture for macOS

Savers Capture is a compact menu bar screenshot companion for the **Rebuild preview**.
Press macOS's **Copy picture of selected area to the clipboard** shortcut
(default **Control–Shift–Command–4**) and drag to select an area. Savers Capture
notices the clipboard image and opens a small preview at the bottom left. New
previews stack above earlier ones at a consistent width and spacing, wrapping to
the next column when the screen is full. Closing a lower preview slides the
previews above it down. Hover over an image to blur and darken it and show four corner
actions:

- **X** closes the preview.
- **Download** saves a PNG on the Desktop and closes that preview.
- **Plus** opens a larger image-only view.
- **Copy** in the center copies the image to the clipboard.
- **Green Savers mark** sends the screenshot to the Rebuild library and closes that preview.

Each preview control responds to hover. The larger image has a hover X in its
top left; closing that window leaves Savers Capture running in the menu bar.

The Rebuild preview stores cards in that browser. The Mac app opens it once with
a private pairing token, then hands screenshots over through a loopback-only
connection. Captures are queued in Application Support until the browser saves
them, and are then removed from the queue. Nothing is sent to the old Savers
service or saved to the Desktop when you choose Rebuild. If the browser tab is
closed, choose **Open Rebuild** from the menu bar later to finish the handoff.

Change the screenshot shortcut in **System Settings → Keyboard → Keyboard
Shortcuts → Screenshots → Copy picture of selected area to the clipboard**.
Savers Capture's **Settings…** window opens the Keyboard settings and shows
this path. macOS owns the actual shortcut; Savers Capture automatically picks
up the resulting clipboard image. It does not need Screen Recording access.
Images copied from CleanShot also work. **Use Clipboard Image** in the menu bar
imports the current image manually. macOS 13 or newer is required. This build
is ad hoc signed and not notarized, so macOS may ask you to allow it in **System
Settings → Privacy & Security → Open Anyway**.

The Settings window also offers **Ensure 2× screenshot output**. Retina
screenshots generally arrive at 2× already. If a clipboard image has fewer
pixels than 2× its logical size, the app enlarges it for Desktop, Copy, and
Rebuild output; this cannot restore detail missing from the original capture.

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
