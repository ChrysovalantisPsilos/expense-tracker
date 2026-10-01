// The lock PIN's storage and hash on the phone: one generic-password item in
// the Keychain (this device only, readable once the phone was unlocked after
// a restart, never in a backup or iCloud), and PBKDF2-HMAC-SHA256 over a
// random 16-byte salt (CommonCrypto). AppPin holds the rules.
import CommonCrypto
import Foundation
import Security

final class KeychainPinVault: PinVault {
    private let service = "com.budgeer.app.lock-pin"
    private let account = "pin"

    private var query: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
         kSecAttrAccount as String: account]
    }

    func read() -> Data? {
        var ask = query
        ask[kSecReturnData as String] = true
        ask[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: AnyObject?
        guard SecItemCopyMatching(ask as CFDictionary, &out) == errSecSuccess else { return nil }
        return out as? Data
    }

    func write(_ data: Data) -> Bool {
        let update: [String: Any] = [kSecValueData as String: data]
        let status = SecItemUpdate(query as CFDictionary, update as CFDictionary)
        if status == errSecSuccess { return true }
        guard status == errSecItemNotFound else { return false }
        var add = query
        add[kSecValueData as String] = data
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        return SecItemAdd(add as CFDictionary, nil) == errSecSuccess
    }

    func erase() {
        SecItemDelete(query as CFDictionary)
    }
}

struct PBKDF2PinHasher: PinHasher {
    func salt() -> Data {
        var bytes = [UInt8](repeating: 0, count: 16)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        return Data(bytes)
    }

    func hash(_ pin: String, salt: Data, rounds: Int) -> Data {
        let password = Array(pin.utf8).map { Int8(bitPattern: $0) }
        var out = [UInt8](repeating: 0, count: 32)
        let saltBytes = [UInt8](salt)
        _ = CCKeyDerivationPBKDF(CCPBKDFAlgorithm(kCCPBKDF2), password, password.count, saltBytes, saltBytes.count,
                                 CCPseudoRandomAlgorithm(kCCPRFHmacAlgSHA256), UInt32(rounds), &out, out.count)
        return Data(out)
    }
}
