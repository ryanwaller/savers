"use client";

// Glue between the web app (Next.js) and the iOS Capacitor shell.
//
// On the desktop web build none of these calls do anything:
// `Capacitor.isNativePlatform()` returns false, the imports tree-shake to
// no-ops at runtime, and the existing window-based redirects continue
// working unchanged.
//
// On iOS we:
//   • Open OAuth in an SFSafariViewController (via @capacitor/browser)
//     instead of inside the WKWebView — required because Google blocks
//     OAuth in plain WebViews.
//   • Configure Supabase's redirectTo to a custom URL scheme:
//     savers://auth/callback?...
//   • Listen for that scheme via @capacitor/app's appUrlOpen event and
//     forward the auth code to the in-app /auth/callback route, which
//     exchanges it for a session in the WebView's cookie jar.

import { Capacitor, registerPlugin } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";

export const NATIVE_REDIRECT = "savers://auth/callback";

// Custom Capacitor plugin: ASWebAuthenticationSession. See
// mobile/ios-plugins/AuthSessionPlugin.swift for the native side. We need
// this because SFSafariViewController (used by @capacitor/browser) is
// blocked by Apple from auto-launching custom URL schemes — exactly the
// thing our OAuth callback relies on.
interface AuthSessionPlugin {
  authenticate(options: {
    url: string;
    callbackScheme: string;
  }): Promise<{ url: string }>;
}

const AuthSession = registerPlugin<AuthSessionPlugin>("AuthSession");

/**
 * Run an OAuth flow inside ASWebAuthenticationSession. iOS captures the
 * redirect to `callbackScheme://...` and returns the final callback URL
 * here, without any URL-scheme bounce-through required.
 *
 * Falls back to a plain navigation on web.
 */
export async function runOAuthInAuthSession(
  url: string,
  callbackScheme = "savers"
): Promise<string | null> {
  if (!isNative()) {
    window.location.assign(url);
    return null;
  }
  try {
    const result = await AuthSession.authenticate({ url, callbackScheme });
    return result.url;
  } catch (error) {
    const message =
      error && typeof error === "object" && "message" in error
        ? String((error as { message: unknown }).message)
        : String(error);
    if (message === "USER_CANCELLED") return null;
    throw error;
  }
}

let listenerRegistered = false;

export function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/**
 * On iOS, open the OAuth URL in an in-app Safari view (which Google
 * accepts). On desktop, fall back to a normal full-page redirect.
 */
export async function openOAuthUrl(url: string): Promise<void> {
  if (!isNative()) {
    window.location.assign(url);
    return;
  }
  await Browser.open({
    url,
    presentationStyle: "popover",
    windowName: "_self",
  });
}

/**
 * Wires up the Capacitor URL-scheme listener that turns
 * savers://auth/callback?... into an in-WebView load of /auth/callback?...
 * so the session cookie lands in the right cookie jar.
 *
 * Safe to call multiple times; only registers once.
 */
export function registerAuthDeepLinkHandler(): void {
  if (!isNative() || listenerRegistered) return;
  listenerRegistered = true;

  void CapacitorApp.addListener("appUrlOpen", async ({ url }) => {
    try {
      const incoming = new URL(url);
      const isAuthCallback =
        incoming.protocol === "savers:" &&
        (incoming.host === "auth" || incoming.pathname === "/auth/callback") &&
        (incoming.pathname === "/callback" ||
          incoming.pathname === "/auth/callback" ||
          incoming.pathname === "");
      if (!isAuthCallback) return;

      // Build /auth/callback?... using the host-app origin so the request
      // hits Railway, exchanges the code, and sets the session cookie that
      // the WebView will then read on subsequent requests.
      const target = new URL("/auth/callback", window.location.origin);
      for (const [key, value] of incoming.searchParams.entries()) {
        target.searchParams.set(key, value);
      }
      // OAuth implicit-flow tokens come back in the URL fragment.
      if (incoming.hash) {
        target.hash = incoming.hash;
      }

      // Close the in-app Safari sheet so the user lands in the app.
      try {
        await Browser.close();
      } catch {
        // Browser may already be closed; ignore.
      }

      window.location.assign(target.toString());
    } catch (error) {
      console.error("appUrlOpen handler failed", error);
    }
  });
}
