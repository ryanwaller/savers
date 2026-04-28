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

    /// Personal API token for the Share Extension to authenticate with.
    /// Mint this at:  Settings → API tokens → Create token  in the Savers
    /// web app, then paste the secret here.
    ///
    /// Treat this like a password. Don't commit a populated value to a
    /// public repository.
    static let apiToken = "svr_xeDOTONPvO7kdhJ1EeXKT-HPPRF5EsMCWhI2BoQB_6E"
}
