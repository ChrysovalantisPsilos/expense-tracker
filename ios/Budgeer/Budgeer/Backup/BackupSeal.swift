// A backup's password, on this phone: the website's backupCrypto.js with
// Apple's own primitives, so a file sealed on one opens on the other. How a
// file is sealed is the core's (backupMath.SEAL: PBKDF2-SHA256 over 600,000
// iterations into an AES-GCM-256 key, a 16-byte salt, a 12-byte IV, the
// format and version as the authenticated data), and an envelope's
// parameters are checked by the core before any work (envelopeParams). Here
// is only the crypto: CommonCrypto's PBKDF2, CryptoKit's AES-GCM (the
// ciphertext with its 16-byte tag at the end, as WebCrypto writes it) and the
// system's random bytes. The password never leaves the phone and is never kept.
import Foundation
import CryptoKit
import CommonCrypto
import Security

struct BackupSeal: BackupSealing {
    func seal(_ text: String, password: String, iterations: Int, saltBytes: Int, ivBytes: Int,
              aad: String) throws -> (salt: String, iv: String, ciphertext: String) {
        let salt = try BackupSeal.random(saltBytes)
        let iv = try BackupSeal.random(ivBytes)
        let key = try BackupSeal.key(password, salt: salt, iterations: iterations)
        let box = try AES.GCM.seal(Data(text.utf8), using: key, nonce: AES.GCM.Nonce(data: iv), authenticating: Data(aad.utf8))
        return (salt.base64EncodedString(), iv.base64EncodedString(), (box.ciphertext + box.tag).base64EncodedString())
    }

    func open(salt: String, iv: String, ciphertext: String, iterations: Int, aad: String, password: String) throws -> String {
        guard let saltData = Data(base64Encoded: salt), let ivData = Data(base64Encoded: iv),
              let sealed = Data(base64Encoded: ciphertext), sealed.count >= 16 else { throw BackupSealFailed() }
        let key = try BackupSeal.key(password, salt: saltData, iterations: iterations)
        let box = try AES.GCM.SealedBox(nonce: AES.GCM.Nonce(data: ivData), ciphertext: sealed.dropLast(16), tag: sealed.suffix(16))
        let plain = try AES.GCM.open(box, using: key, authenticating: Data(aad.utf8))
        return String(decoding: plain, as: UTF8.self)
    }

    /// PBKDF2-HMAC-SHA256 of the password's UTF-8 bytes (WebCrypto's 'raw' import) → a 256-bit key.
    static func key(_ password: String, salt: Data, iterations: Int) throws -> SymmetricKey {
        let secret = Array(password.utf8)
        let length = 32
        var derived = [UInt8](repeating: 0, count: length)
        let status = salt.withUnsafeBytes { saltBytes in
            secret.withUnsafeBufferPointer { passwordBytes in
                derived.withUnsafeMutableBufferPointer { key in
                    CCKeyDerivationPBKDF(CCPBKDFAlgorithm(kCCPBKDF2),
                                         passwordBytes.baseAddress.map { UnsafeRawPointer($0).assumingMemoryBound(to: CChar.self) },
                                         secret.count,
                                         saltBytes.bindMemory(to: UInt8.self).baseAddress, salt.count,
                                         CCPseudoRandomAlgorithm(kCCPRFHmacAlgSHA256), UInt32(iterations),
                                         key.baseAddress, length)
                }
            }
        }
        guard status == Int32(kCCSuccess) else { throw BackupSealFailed() }
        return SymmetricKey(data: derived)
    }

    static func random(_ count: Int) throws -> Data {
        var bytes = [UInt8](repeating: 0, count: count)
        guard SecRandomCopyBytes(kSecRandomDefault, count, &bytes) == errSecSuccess else { throw BackupSealFailed() }
        return Data(bytes)
    }
}
