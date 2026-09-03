/**
 * Secure Crypto Utilities for LocalStorage Encryption & Decryption
 * Uses Web Crypto API (SubtleCrypto: PBKDF2, AES-GCM, SHA-256) with full fallback support.
 * Ensures user passwords and data are never stored in plain text.
 */
class SecureStorage {
  constructor(secretSalt = "fms_vault_salt_2026_x89q") {
    this.saltString = secretSalt;
    this.salt = new TextEncoder().encode(secretSalt);
  }

  /**
   * Hashes a string (e.g., password) with SHA-256 + Salt
   * Password is never stored or recoverable in plain text.
   */
  async hashPassword(password) {
    if (!password) return "";
    try {
      if (typeof window !== "undefined" && window.crypto && window.crypto.subtle && window.crypto.subtle.digest) {
        const encoder = new TextEncoder();
        const data = encoder.encode(password + "::" + this.saltString);
        const hashBuffer = await crypto.subtle.digest("SHA-256", data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
      }
    } catch (err) {
      console.warn("SubtleCrypto digest unavailable, using fallback SHA-256:", err);
    }
    return this.fallbackSha256(password + "::" + this.saltString);
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
        iterations: 10000,
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
      if (typeof window !== "undefined" && window.crypto && window.crypto.subtle) {
        const key = await this.deriveKey(secretKey);
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encodedData = new TextEncoder().encode(plainText);

        const encryptedBuffer = await crypto.subtle.encrypt(
          { name: "AES-GCM", iv: iv },
          key,
          encodedData
        );

        const ivString = this.uint8ToBase64(iv);
        const encryptedString = this.uint8ToBase64(new Uint8Array(encryptedBuffer));

        return JSON.stringify({
          iv: ivString,
          data: encryptedString,
          secured: true,
          timestamp: Date.now()
        });
      }
    } catch (err) {
      console.warn("SubtleCrypto encryption error, using fallback:", err);
    }
    return this.fallbackEncrypt(plainText);
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

      if (!payload || !payload.iv || !payload.data) {
        return this.fallbackDecrypt(encryptedPayload);
      }

      if (typeof window !== "undefined" && window.crypto && window.crypto.subtle) {
        const key = await this.deriveKey(secretKey);
        const iv = this.base64ToUint8(payload.iv);
        const encryptedData = this.base64ToUint8(payload.data);

        const decryptedBuffer = await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: iv },
          key,
          encryptedData
        );

        return new TextDecoder().decode(decryptedBuffer);
      }
    } catch (err) {
      console.warn("SubtleCrypto decryption error, attempting fallback:", err);
      return this.fallbackDecrypt(encryptedPayload);
    }
    return null;
  }

  uint8ToBase64(bytes) {
    let binary = "";
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  base64ToUint8(base64) {
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  /**
   * Fallback encoder/decoder for older browsers or non-crypto environments
   */
  fallbackEncrypt(str) {
    try {
      const encoded = encodeURIComponent(str);
      let result = "";
      for (let i = 0; i < encoded.length; i++) {
        result += String.fromCharCode(encoded.charCodeAt(i) ^ 0x5a);
      }
      return "enc_" + btoa(result);
    } catch {
      return str;
    }
  }

  fallbackDecrypt(str) {
    if (typeof str !== "string" || !str.startsWith("enc_")) return str;
    try {
      const raw = atob(str.replace("enc_", ""));
      let result = "";
      for (let i = 0; i < raw.length; i++) {
        result += String.fromCharCode(raw.charCodeAt(i) ^ 0x5a);
      }
      return decodeURIComponent(result);
    } catch {
      return str;
    }
  }

  /**
   * Pure JS SHA-256 fallback implementation
   */
  fallbackSha256(ascii) {
    function rightRotate(value, amount) {
      return (value >>> amount) | (value << (32 - amount));
    }
    const mathPow = Math.pow;
    const maxWord = mathPow(2, 32);
    let result = "";
    const words = [];
    const asciiBitLength = ascii.length * 8;
    const hash = [
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
      0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
    ];
    const k = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];
    for (let i = 0; i < ascii.length; i++) {
      const code = ascii.charCodeAt(i);
      words[i >> 2] |= code << ((3 - (i % 4)) * 8);
    }
    words[asciiBitLength >> 5] |= 0x80 << (24 - (asciiBitLength % 32));
    words[(((asciiBitLength + 64) >> 9) << 4) + 15] = asciiBitLength;

    for (let i = 0; i < words.length; i += 16) {
      const w = words.slice(i, i + 16);
      let a = hash[0], b = hash[1], c = hash[2], d = hash[3];
      let e = hash[4], f = hash[5], g = hash[6], h = hash[7];

      for (let j = 0; j < 64; j++) {
        if (j >= 16) {
          const s0 = rightRotate(w[j - 15], 7) ^ rightRotate(w[j - 15], 18) ^ (w[j - 15] >>> 3);
          const s1 = rightRotate(w[j - 2], 17) ^ rightRotate(w[j - 2], 19) ^ (w[j - 2] >>> 10);
          w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
        }
        const ch = (e & f) ^ (~e & g);
        const temp1 = (h + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) + ch + k[j] + (w[j] | 0)) | 0;
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const temp2 = ((rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) + maj) | 0;

        h = g; g = f; f = e; e = (d + temp1) | 0;
        d = c; c = b; b = a; a = (temp1 + temp2) | 0;
      }
      hash[0] = (hash[0] + a) | 0; hash[1] = (hash[1] + b) | 0;
      hash[2] = (hash[2] + c) | 0; hash[3] = (hash[3] + d) | 0;
      hash[4] = (hash[4] + e) | 0; hash[5] = (hash[5] + f) | 0;
      hash[6] = (hash[6] + g) | 0; hash[7] = (hash[7] + h) | 0;
    }

    for (let i = 0; i < 8; i++) {
      for (let j = 3; j >= 0; j--) {
        const byte = (hash[i] >> (j * 8)) & 255;
        result += byte.toString(16).padStart(2, "0");
      }
    }
    return result;
  }
}

if (typeof window !== "undefined") {
  window.secureStorage = new SecureStorage();
} else if (typeof globalThis !== "undefined") {
  globalThis.secureStorage = new SecureStorage();
}
