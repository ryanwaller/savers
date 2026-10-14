# Savers Chrome extension

Click the Savers icon in Chrome's toolbar to save the current page to Unsorted. A small status message appears at the top of the page; the tab stays open. The toolbar badge also reports success or failure. The page's title is saved immediately, and Savers queues its preview and automatic tags afterward.

## Install the unpacked extension

1. Download the extension ZIP from Savers Settings and extract it.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select this `chrome-extension` folder.
4. Pin Savers from Chrome's Extensions menu.

If the extension was already loaded, click **Reload** on its card in `chrome://extensions` after updating the files.

## Connect Savers

1. In Savers, open **Settings → Browser extension → Create extension token**.
2. Copy the token shown there. It is displayed only once.
3. Right-click the Savers toolbar icon, choose **Options**, paste the token, and click **Save token**.

The token stays in Chrome's extension storage. The extension sends it only to the configured Savers server. Revoke it in Savers Settings if you stop using the extension.

The extension can also use an existing Savers browser session, but the token makes saving reliable when Chrome limits cookies from extensions.
