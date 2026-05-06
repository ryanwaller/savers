// TokenStore.swift
// Shared keychain helper used by both the main Capacitor app and the
// Share Extension. The token is stored under a single account name in
// an App Group-shared keychain so the share extension (a separate
// process) can read what the main app wrote.
//
// Set the access group to match your provisioning profile (e.g.
// "ABCDE12345.us.othermeans.savers") and the App Group entitlement on
// both targets to "group.us.othermeans.savers". Without that, the share
// extension can't see what the main app stored.

import Foundation
import Security

enum TokenStore {
    private static let service = "us.othermeans.savers.api"
    private static let account = "default"
    /// Update the team prefix to match your Apple Developer team.
    /// Example: "ABCDE12345.us.othermeans.savers" — find your team prefix in
    /// the Apple Developer membership page or in Xcode → target → Signing &
    /// Capabilities → "Team". If you don't set this, the keychain entry is
    /// not shared between the main app and the extension.
    private static let accessGroup: String? = nil  // e.g. "ABCDE12345.us.othermeans.savers"

    static func write(_ token: String) {
        delete()
        let data = Data(token.utf8)
        var attrs: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock,
        ]
        if let accessGroup {
            attrs[kSecAttrAccessGroup as String] = accessGroup
        }
        SecItemAdd(attrs as CFDictionary, nil)
    }

    static func read() -> String? {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        if let accessGroup {
            query[kSecAttrAccessGroup as String] = accessGroup
        }
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess,
              let data = item as? Data,
              let token = String(data: data, encoding: .utf8) else { return nil }
        return token
    }

    static func delete() {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        if let accessGroup {
            query[kSecAttrAccessGroup as String] = accessGroup
        }
        SecItemDelete(query as CFDictionary)
    }
}
