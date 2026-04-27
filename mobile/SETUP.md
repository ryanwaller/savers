# Savers iOS — sideload guide

End-to-end walkthrough for getting Savers as an installable app on your
iPhone, signed with a free Apple ID.

What you'll get:
- A real Savers app icon on your home screen, opening into the live
  web app inside a native shell.
- "Savers" appearing in the iOS Share Sheet from Safari, Threads, X,
  and any other app — tapping it instantly saves the URL to your
  library.

What this doesn't do (yet):
- No Hybrid edit-toast in the Share Extension. v1 is quick save only.
- No bundled offline mode — the app shows "Connecting…" if the network is
  out at launch.

The walkthrough is split into five parts. Reckon 30–60 minutes for a
first-time run.

---

## 1. Apply the database migration

The Share Extension authenticates with API tokens. We added a
`savers.api_tokens` table — apply that migration first.

Open Supabase SQL editor for your project and paste the contents of
`migrations/008_api_tokens.sql`, then run it. Done.

(You only have to do this once.)

---

## 2. Mint a token in the web app

Pull the latest code on your machine and let Railway redeploy:

```
cd ~/Dev/savers/handoff
git pull
```

Once Railway has redeployed (~1 min):

1. Open the Savers web app in Chrome desktop.
2. Top-right of the header, click **Settings** next to your email.
3. In the **API tokens** section, type a name like `iPhone Share` and
   click **Create token**.
4. Copy the token immediately. It starts with `svr_…` and you only
   see it once. If you lose it, revoke and create a new one.

Set the token aside for step 4.

---

## 3. Generate the iOS project

You only do this once. From your repo root:

```
cd ~/Dev/savers/handoff/mobile
npm install
npx cap add ios
```

That creates a complete `ios/` folder with the Capacitor shell. From
now on, anything you customize in Xcode lives there and is committed
back into the repo.

Open Xcode:

```
npx cap open ios
```

Xcode will launch with the workspace `ios/App/App.xcworkspace`.

---

## 4. Configure the main app target

In Xcode:

1. Select the project in the navigator (top of left sidebar — the blue
   `App` icon).
2. Select target **App** in the editor.
3. **Signing & Capabilities** tab:
   - Tick **Automatically manage signing**.
   - **Team:** pick your Apple ID. If it's not in the list, click
     **Add an Account…** and sign in with your free Apple ID first.
   - **Bundle identifier:** change to something unique to you, e.g.
     `us.othermeans.savers`. Apple's free signing requires the bundle
     ID is unique per Apple ID — if it conflicts you'll get an error.
4. **General** tab → **Minimum Deployments** → set iOS 16.0 (or higher).

Plug your iPhone in via cable. At the top of the Xcode window, where it
shows the run target, pick your phone from the dropdown.

Hit **Run** (▶️ button or ⌘R).

First run will:
- Ask your iPhone to trust the developer certificate. On the phone go to
  **Settings → General → VPN & Device Management → your Apple ID →
  Trust**.
- Build, install, and launch the app on your phone.

You should now see a **Savers** icon on your home screen and the app opens
into the live web view.

---

## 5. Add the Share Extension target

This is the bigger step but only happens once.

In Xcode:

1. **File → New → Target…**
2. Pick **Share Extension** under iOS. Click **Next**.
3. **Product Name:** `SaversShare`. Language: Swift. Click **Finish**.
4. When Xcode asks "Activate SaversShare scheme?" click **Activate**.
5. In the navigator a `SaversShare` group appears with a generated
   `ShareViewController.swift`, `MainInterface.storyboard`, and
   `Info.plist`. We'll replace these.

### Replace the generated files

In Finder, copy these files from `mobile/ShareExtension/` into the
SaversShare folder inside your Xcode project:

- `ShareViewController.swift` → replace the existing one
- `TokenStore.swift` → add new
- `Config.swift` → add new
- `Info.plist` → replace the existing one

In Xcode, drag the files from Finder into the SaversShare group. Make
sure to:

- Tick **Copy items if needed** (so they live inside your repo).
- **Targets:** for `Config.swift` and `TokenStore.swift`, tick BOTH
  the `App` target AND the `SaversShare` target — they're shared.
  For `ShareViewController.swift` and `Info.plist`, only the
  `SaversShare` target.

Delete the auto-generated `MainInterface.storyboard` — we don't use it
(our `ShareViewController` builds its UI in code).

### Configure SaversShare signing

1. Select the `SaversShare` target.
2. **Signing & Capabilities** tab.
3. Same Apple ID team as the main app.
4. Bundle identifier: `us.othermeans.savers.SaversShare` (must start
   with the main app's bundle ID, plus a suffix).
5. Minimum Deployments → iOS 16.0 to match the main app.

### Paste your token into Config.swift

Open `Config.swift`. Paste the token from step 2 into `apiToken`:

```swift
static let apiToken = "svr_yourTokenHere..."
```

Save.

### Build and install

Hit **Run** again with your iPhone selected. The main app + the share
extension will install together.

---

## 6. Test the share flow

1. On your iPhone, open Safari (or Chrome — same engine).
2. Navigate to any web page.
3. Tap the **Share** button (bottom of Safari toolbar, square with arrow).
4. In the share sheet's app row, scroll to find **Savers**. The first
   time, you may have to tap **More**, then enable Savers in the list.
5. Tap **Savers**. You'll see a "Saving…" card, then "Saved." for half
   a second, then it dismisses.
6. Open the Savers app — the bookmark is there in Unsorted (or
   auto-filed by AI).

---

## Caveats with free Apple ID sideload

- **7-day expiration.** The signing certificate expires after a week
  on a free Apple ID. After that, the app crashes on launch with no
  warning. To fix, plug into Xcode, hit Run again — it re-signs and
  the clock restarts. You can do this on the same Mac you originally
  built from.
- **3-app limit.** A free Apple ID can have at most 3 sideloaded apps
  installed at once. Savers + share extension counts as 1.
- **Fix at any time:** if you upgrade to a paid Apple Developer
  account ($99/year), the cert lasts 1 year, the limit is much higher,
  and you can ship via TestFlight without rebuilding.

---

## Distributing to others later

When you're ready to give Savers to other people:

1. Sign up for the Apple Developer Program ($99/year).
2. Replace the hardcoded `Config.apiToken` with a setup screen that
   collects the token at first launch and stores it in the shared
   App Group keychain (use the existing `TokenStore.swift` as the
   implementation — just enable the App Group entitlement on both
   targets and set the access group).
3. In Xcode: **Product → Archive**, then upload to App Store Connect
   and invite testers via TestFlight. No App Store review needed for
   internal testing groups. Public TestFlight links require a quick
   beta review (~1 day).

That's a different chunk of work — not covered here.
