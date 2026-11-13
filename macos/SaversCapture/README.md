# Savers Capture for macOS

Savers Capture is a compact menu bar screenshot companion for Savers. Its default address points to the connected Rebuild app and saves screenshots to your signed-in Savers library.
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

The newest preview accepts **Escape** to close it and **Return** to copy it to
the clipboard and dismiss it. It takes keyboard focus without activating Savers
Capture or switching away from the app beneath the preview.

Dismissed previews shrink, lower, and fade before the remaining previews slide into place.

Each preview control responds to hover. The larger image has a hover X in its
top left; closing that window leaves Savers Capture running in the menu bar.

The Mac app opens Savers once with a private pairing token, then hands screenshots
over through a loopback-only connection. Captures are queued in Application Support
until the signed-in browser saves them to your Savers account and acknowledges them.
If the browser tab is closed, choose **Open Savers**
from the menu bar later to finish the handoff.

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
`https://savers-rebuild-connected-production.up.railway.app`. You can change it
in the menu bar's **Settings…** window. **Open Savers** pairs that browser with
the Mac app using a token stored in the app's preferences and browser storage.
The pairing token remains in the URL fragment only until the page loads.
The app opens Savers at its root address. Sign in there before sending screenshots;
the page keeps the pairing token through sign-in and uploads queued captures after
the account is ready.
