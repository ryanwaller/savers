# Savers Chrome Extension

Legacy extension implementation. Do not load this alongside `/Users/ryanwaller/Dev/savers/handoff/extension`, or you may trigger duplicate save requests.

This is a lightweight unpacked Chrome extension for quickly saving the current tab into the local Savers app.

## Load it in Chrome

1. Open `chrome://extensions`
2. Turn on `Developer mode`
3. Click `Load unpacked`
4. Select this folder:

`/Users/ryanwaller/Dev/savers/handoff/chrome-extension`

## How it works

- Reads the active tab URL and title
- Fetches metadata from your running Savers app
- Lets you choose or create a collection
- Saves straight into `/api/bookmarks`

## Default app URL

The popup defaults to:

`http://localhost:3000`

You can change it inside the popup, and it will be remembered in Chrome storage.

## Notes

- The Savers app needs to be running locally for the extension to work.
- The manifest currently allows requests to:
  - `http://localhost:3000/*`
  - `http://127.0.0.1:3000/*`
