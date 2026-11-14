// Config.swift
//
// One-stop configuration for the iOS app. Add this file to BOTH the main
// app target AND the Share Extension target in Xcode.
//
// For personal sideload: paste your API token here, commit only to a private
// fork (or .gitignore this file before pushing publicly).
//
// When you ship this to others via TestFlight, replace the hardcoded token
// with a setup UI that writes to a shared App Group keychain — see
// TokenStore.swift for the pattern.

import Foundation

enum Config {
    /// Where Savers is hosted. The Capacitor shell loads this URL, and the
    /// share extension hits its API endpoints.
    static let apiBase = "https://savers-production.up.railway.app"

    /// Load the personal token from an untracked resource in the share
    /// extension target. Never put a token in a tracked Swift source file.
    static var apiToken: String {
        guard let url = Bundle.main.url(forResource: "SaversShareSecrets", withExtension: "plist"),
              let values = NSDictionary(contentsOf: url),
              let token = values["SaversApiToken"] as? String else { return "" }
        return token.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
