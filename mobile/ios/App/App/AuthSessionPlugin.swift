// AuthSessionPlugin.swift
//
// Bridges JavaScript → ASWebAuthenticationSession on iOS. We need this
// because @capacitor/browser uses SFSafariViewController, which iOS
// intentionally blocks from auto-launching custom URL schemes (savers://).
// ASWebAuthenticationSession is Apple's purpose-built OAuth API — it
// captures the redirect to the registered callback scheme and returns the
// final URL straight back to JS, no Info.plist URL-scheme deep-link
// roundtrip required.
//
// Setup (one time, in Xcode):
//   1. Drag this file into the App target in your Capacitor iOS project.
//      In the dialog, ensure the App target is checked.
//   2. Capacitor 7 discovers the plugin via the CAPBridgedPlugin protocol —
//      no registerPlugin() call or Podfile entry needed.
//   3. Build & run.
//
// Usage from JS:
//   import { registerPlugin } from "@capacitor/core";
//   const AuthSession = registerPlugin<{
//     authenticate(opts: { url: string; callbackScheme: string }):
//       Promise<{ url: string }>;
//   }>("AuthSession");

import Foundation
import Capacitor
import AuthenticationServices

@objc(AuthSessionPlugin)
public class AuthSessionPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AuthSessionPlugin"
    public let jsName = "AuthSession"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "authenticate", returnType: CAPPluginReturnPromise),
    ]

    private var currentSession: ASWebAuthenticationSession?

    @objc func authenticate(_ call: CAPPluginCall) {
        guard let urlString = call.getString("url"),
              let url = URL(string: urlString) else {
            call.reject("Missing or invalid 'url'.")
            return
        }
        guard let callbackScheme = call.getString("callbackScheme"),
              !callbackScheme.isEmpty else {
            call.reject("Missing 'callbackScheme'.")
            return
        }

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }

            let session = ASWebAuthenticationSession(
                url: url,
                callbackURLScheme: callbackScheme
            ) { callbackURL, error in
                self.currentSession = nil

                if let error = error {
                    let nsError = error as NSError
                    if nsError.domain == ASWebAuthenticationSessionErrorDomain,
                       nsError.code == ASWebAuthenticationSessionError.canceledLogin.rawValue {
                        call.reject("USER_CANCELLED", "USER_CANCELLED")
                    } else {
                        call.reject(error.localizedDescription)
                    }
                    return
                }

                guard let callbackURL = callbackURL else {
                    call.reject("No callback URL returned.")
                    return
                }

                call.resolve([
                    "url": callbackURL.absoluteString
                ])
            }

            session.presentationContextProvider = self
            // false → reuse Safari's cookie jar so an existing Google sign-in
            // is recognized. Set true if you want a fully isolated session.
            session.prefersEphemeralWebBrowserSession = false

            self.currentSession = session
            session.start()
        }
    }
}

extension AuthSessionPlugin: ASWebAuthenticationPresentationContextProviding {
    public func presentationAnchor(
        for session: ASWebAuthenticationSession
    ) -> ASPresentationAnchor {
        let scenes = UIApplication.shared.connectedScenes
        for scene in scenes {
            if let windowScene = scene as? UIWindowScene {
                if let keyWindow = windowScene.windows.first(where: { $0.isKeyWindow }) {
                    return keyWindow
                }
                if let firstWindow = windowScene.windows.first {
                    return firstWindow
                }
            }
        }
        return UIWindow()
    }
}
