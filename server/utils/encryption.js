const crypto = require("crypto");

class Encryption {
  constructor(key) {
    // Ensure key is 32 bytes for AES-256
    this.algorithm = "aes-256-cbc";
    this.key = this.deriveKey(key);
  }

  deriveKey(password) {
    // Create a consistent 32-byte key from the password
    return crypto.createHash("sha256").update(String(password)).digest();
  }

  encrypt(text) {
    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);

      let encrypted = cipher.update(text, "utf8", "hex");
      encrypted += cipher.final("hex");

      // Return iv:encrypted format
      return iv.toString("hex") + ":" + encrypted;
    } catch (error) {
      throw new Error("Encryption failed: " + error.message);
    }
  }

  decrypt(encryptedText) {
    try {
      // Check if it's the new format (contains colon separator)
      if (encryptedText.includes(":")) {
        // New format: iv:encrypted
        const parts = encryptedText.split(":");
        if (parts.length !== 2) {
          throw new Error("Invalid encrypted text format");
        }

        const iv = Buffer.from(parts[0], "hex");
        const encrypted = parts[1];

        const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);

        let decrypted = decipher.update(encrypted, "hex", "utf8");
        decrypted += decipher.final("utf8");

        return decrypted;
      } else {
        // Try old format (using deprecated createDecipher)
        // This is for backwards compatibility with existing encrypted data
        try {
          // For old format, we need to use the raw key as a password
          const keyString = process.env.ENCRYPTION_KEY || this.key.toString('hex');
          const decipher = crypto.createDecipher("aes-256-cbc", keyString);
          
          let decrypted = decipher.update(encryptedText, "hex", "utf8");
          decrypted += decipher.final("utf8");
          
          return decrypted;
        } catch (oldError) {
          // If old format also fails, throw error
          throw new Error("Failed to decrypt with both new and old formats");
        }
      }
    } catch (error) {
      throw new Error("Decryption failed: " + error.message);
    }
  }

  // Method to re-encrypt data from old format to new format
  migrateEncryption(oldEncryptedText) {
    try {
      // First decrypt using old method
      const decrypted = this.decrypt(oldEncryptedText);
      // Then encrypt using new method
      return this.encrypt(decrypted);
    } catch (error) {
      throw new Error("Migration failed: " + error.message);
    }
  }
}

module.exports = Encryption;