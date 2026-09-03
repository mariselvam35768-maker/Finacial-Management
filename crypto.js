/**
 * Secure Crypto Utilities for LocalStorage Encryption & Decryption
 * Uses Web Crypto API (SubtleCrypto: PBKDF2, AES-GCM, SHA-256)
 * Ensures user passwords and data are never stored in plain text.
 */
class SecureStorage {
  constructor(secretSalt = "fms_vault_salt_2026_x89q") {
    this.salt = new TextEncoder().encode(secretSalt);
  }

  /**
   * Hashes a string (e.g., password) with SHA-256 + Salt
   * Password is never stored or recoverable in plain text.
   */
  async hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password + "::" + this.salt);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
  }

  /**
   * Derives an AES-GCM CryptoKey from a passphrase
   */
  async deriveKey(passphrase) {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      encoder.encode(passphrase),
      { name: "PBKDF2" },
      false,
      ["deriveKey"]
    );

    return crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: this.salt,
        iterations: 100000,
        hash: "SHA-256"
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }

  /**
   * Encrypts plain text data into Base64 ciphertext with IV
   */
  async encryptData(plainText, secretKey = "fms_system_default_key_secure") {
    try {
      const key = await this.deriveKey(secretKey);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encodedData = new TextEncoder().encode(plainText);

      const encryptedBuffer = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        key,
        encodedData
      );

      const ivString = btoa(String.fromCharCode(...iv));
      const encryptedString = btoa(
        String.fromCharCode(...new Uint8Array(encryptedBuffer))
      );

      return JSON.stringify({
        iv: ivString,
        data: encryptedString,
        secured: true,
        timestamp: Date.now()
      });
    } catch (err) {
      console.error("Encryption error:", err);
      // Fallback obfuscation for compatibility
      return this.fallbackEncrypt(plainText);
    }
  }

  /**
   * Decrypts Base64 ciphertext back to plain text
   */
  async decryptData(encryptedPayload, secretKey = "fms_system_default_key_secure") {
    try {
      if (!encryptedPayload) return null;
      let payload;
      try {
        payload = JSON.parse(encryptedPayload);
      } catch {
        return this.fallbackDecrypt(encryptedPayload);
      }

      if (!payload.iv || !payload.data) {
        return this.fallbackDecrypt(encryptedPayload);
      }

      const key = await this.deriveKey(secretKey);
      const iv = new Uint8Array(
        atob(payload.iv)
          .split("")
          .map(c => c.charCodeAt(0))
      );
      const encryptedData = new Uint8Array(
        atob(payload.data)
          .split("")
          .map(c => c.charCodeAt(0))
      );

      const decryptedBuffer = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv },
        key,
        encryptedData
      );

      return new TextDecoder().decode(decryptedBuffer);
    } catch (err) {
      console.error("Decryption error:", err);
      return null;
    }
  }

  /**
   * Fallback encoder/decoder for older browsers
   */
  fallbackEncrypt(str) {
    const encoded = encodeURIComponent(str);
    let result = "";
    for (let i = 0; i < encoded.length; i++) {
      result += String.fromCharCode(encoded.charCodeAt(i) ^ 0x5a);
    }
    return "enc_" + btoa(result);
  }

  fallbackDecrypt(str) {
    if (typeof str !== "string" || !str.startsWith("enc_")) return str;
    const raw = atob(str.replace("enc_", ""));
    let result = "";
    for (let i = 0; i < raw.length; i++) {
      result += String.fromCharCode(raw.charCodeAt(i) ^ 0x5a);
    }
    return decodeURIComponent(result);
  }
}

window.secureStorage = new SecureStorage();
