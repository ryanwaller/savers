# Savers Capture for macOS

Savers Capture is a compact menu bar screenshot companion for Savers. Its current default address points to the isolated browser preview while the account-backed staging app is being built.
Press macOS's **Copy picture of selected area to the clipboard** shortcut
(default **Control–Shift–Command–4**) and drag to select an area. Savers Capture
notices the clipboard image and opens a small preview at the bottom left.
Copied design objects with PDF, text, or app-specific clipboard formats are
ignored; use **Use Clipboard Image** in the menu bar to import them intentionally. New
previews stack above earlier ones at a consistent width and spacing, wrapping to
the next column when the screen is full. Closing a lower preview slides the
previews above it down. Hover over an image to blur and darken it and show four corner
actions:

- **X** dismisses the preview.
- **Download** saves a PNG on the Desktop and dismisses that preview.
- **Plus** opens a larger image-only view.
- **Copy** in the center copies the image to the clipboard and dismisses the preview.
- **Green Savers mark** sends the screenshot to Savers and dismisses that preview.

Dismissed previews shrink, lower, and fade before the remaining previews slide into place.

Each preview control responds to hover. The larger image has a hover X in its
top left; closing that window leaves Savers Capture running in the menu bar.

The current browser preview stores cards in that browser. The Mac app opens it once with
a private pairing token, then hands screenshots over through a loopback-only
connection. Captures are queued in Application Support until the browser saves
them, and are then removed from the queue. Nothing is sent to the old Savers
service or saved to the Desktop when you choose the Savers button. If the browser tab is
closed, choose **Open Savers** from the menu bar later to finish the handoff.

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
Savers output; this cannot restore detail missing from the original capture.
The **Screenshot name** field accepts `{date}` and `{time}` placeholders and
sets both the Desktop PNG filename and the title sent to Savers. If a Desktop
filename already exists, the app adds a number instead of overwriting it.

## Build and run

On a Mac with Xcode Command Line Tools installed:

```sh
cd macos/SaversCapture
./build-app.sh
open 'dist/Savers Capture.app'
```

The default Savers address currently is
`https://savers-rebuild-preview-production.up.railway.app`. You can change it
in the menu bar's **Settings…** window. **Open Savers** pairs that browser with
the Mac app using a token stored in the app's preferences and browser storage.
The pairing token remains in the URL fragment only until the page loads.
The app opens the configured site's root path, so the same control can target
the account-backed Savers site when its capture handoff is ready. Until then,
the default preview remains browser-local; changing the address alone does not
enable server-side storage.
