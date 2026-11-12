# Savers Capture for macOS

Savers Capture is a compact menu bar screenshot companion for the **Rebuild preview**.
Press its area shortcut (default **Control–Option–Command–4**) and drag to select
an area, or choose **Capture Screen** from the menu bar. Change the area shortcut
in **Settings…** by clicking its shortcut field and pressing a new combination.
The small preview appears at the bottom left, sized to the image. Hover over it
to blur and darken the image and show four corner actions:

- **X** closes the preview.
- **Download** saves a PNG on the Desktop.
- **Plus** opens a larger, resizable view.
- **Green Savers mark** sends the screenshot to the Rebuild library.

The Rebuild preview stores cards in that browser. The Mac app opens it once with
a private pairing token, then hands screenshots over through a loopback-only
connection. Captures are queued in Application Support until the browser saves
them, and are then removed from the queue. Nothing is sent to the old Savers
service or saved to the Desktop when you choose Rebuild. If the browser tab is
closed, choose **Open Rebuild** from the menu bar later to finish the handoff.

Native area capture requires Screen Recording permission for Savers Capture.
If permission is unavailable, the Mac's built-in **Control–Shift–Command–4**
shortcut copies an area to the clipboard; Savers Capture notices the image and
opens the same preview without its own Screen Recording permission. Images copied
from CleanShot also work. **Use Clipboard Image** in the menu bar imports the
current image manually. macOS 13 or newer is required. This build is ad hoc
signed and not notarized, so macOS may ask you to allow it in **System Settings
→ Privacy & Security → Open Anyway**.

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
