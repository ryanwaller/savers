# Savers rebuild capture

This prototype extension saves into the browser-local [Savers rebuild preview](https://savers-rebuild-preview-production.up.railway.app/). Keep that preview open and unlocked in a Chrome tab. Captures stay in that browser profile; the current Savers account is not changed.

## Install

1. Download and extract `savers-rebuild-capture-0.1.0.zip` from the preview's Browser capture page.
2. Open `chrome://extensions`, enable **Developer mode**, and choose **Load unpacked**.
3. Select the extracted `savers-rebuild-capture` folder.

## Capture

- Click the extension icon to save the current page.
- Right-click a link or image and choose **Save … to Savers**.
- Select text and click the small **Save text** chip, or use the selection's right-click menu.

Each capture saves privately to Unsorted in the rebuild preview. The source page shows a success message with **Undo** and **Edit**. Edit opens the preview editor for title, source, note, collection, tags, and privacy.

The extension uses the preview tab's local browser storage. If the preview is closed, it opens an inactive tab; complete any preview access prompt there before retrying.
