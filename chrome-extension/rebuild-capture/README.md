# Savers rebuild capture

This prototype extension saves into the browser-local [Savers rebuild preview](https://savers-rebuild-preview-production.up.railway.app/). Keep that preview open in a Chrome tab. Captures stay in that browser profile; the current Savers account is not changed.

## Install

1. Download and extract `savers-rebuild-capture-0.2.1.zip` from the preview's Browser capture page.
2. Open `chrome://extensions`, enable **Developer mode**, and choose **Load unpacked**.
3. Select the extracted `savers-rebuild-capture` folder.

## Capture

- Click the extension icon to save the current page.
- Right-click a link or image in Chrome and choose **Save link to Savers** or **Save image to Savers**.
- Select text and click the small **Save text** chip, or use the selection's right-click menu.

Each capture saves privately to Unsorted in the rebuild preview. The source page shows a confirmation in the preview's visual style with **Undo** and **Edit card**. Edit opens the preview editor for title, source, note, collection, tags, and privacy. The extension's toolbar icon uses the rebuild's green mark.

The extension uses the preview tab's local browser storage. If the preview is closed, it opens a tab before saving.

The extension targets the Library page and updates other open preview tabs after a save. If it was installed while the preview was already open, it injects the capture bridge into that tab.

For CleanShot X screenshots, use its Copy action and press ⌘V in the Savers preview, choose **Paste screenshot** from the create menu, or drag the screenshot from CleanShot's Quick Access Overlay onto Savers. These paths do not require saving a file to the desktop.
