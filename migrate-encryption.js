// migrate-encryption.js - Run this once to migrate all encrypted credentials to new format
const fs = require("fs").promises;
const path = require("path");
const crypto = require("crypto");
require("dotenv").config();

const USERS_FILE = path.join(__dirname, "data", "users.json");
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

// Old encryption functions (for decrypting existing data)
function decryptOld(encryptedText) {
  try {
    if (encryptedText.includes(":")) {
      // Already in new format, skip
      return null;
    }
    
    const decipher = crypto.createDecipher("aes-256-cbc", ENCRYPTION_KEY);
    let decrypted = decipher.update(encryptedText, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (error) {
    console.error("Failed to decrypt with old method:", error.message);
    return null;
  }
}

// New encryption function
function encryptNew(text) {
  const key = crypto.createHash("sha256").update(String(ENCRYPTION_KEY)).digest();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  
  return iv.toString("hex") + ":" + encrypted;
}

async function migrateEncryption() {
  console.log("🔄 Starting encryption migration...\n");
  
  try {
    // Check if ENCRYPTION_KEY exists
    if (!ENCRYPTION_KEY) {
      console.error("❌ ENCRYPTION_KEY not found in .env file!");
      console.log("Please ensure your .env file contains ENCRYPTION_KEY");
      process.exit(1);
    }
    
    // Load users file
    console.log("📂 Loading users file...");
    const usersData = await fs.readFile(USERS_FILE, "utf8");
    const users = JSON.parse(usersData);
    
    let migratedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    
    // Process each user
    for (const username in users) {
      const user = users[username];
      
      if (user.forumCredentials) {
        console.log(`\n👤 Processing user: ${username}`);
        
        try {
          let needsUpdate = false;
          
          // Check if username needs migration
          if (user.forumCredentials.username && !user.forumCredentials.username.includes(":")) {
            console.log("  - Migrating username encryption...");
            const decrypted = decryptOld(user.forumCredentials.username);
            
            if (decrypted) {
              user.forumCredentials.username = encryptNew(decrypted);
              needsUpdate = true;
            } else {
              console.log("  ⚠️  Failed to decrypt username, skipping");
              errorCount++;
            }
          } else if (user.forumCredentials.username && user.forumCredentials.username.includes(":")) {
            console.log("  ✓ Username already in new format");
            skippedCount++;
          }
          
          // Check if password needs migration
          if (user.forumCredentials.password && !user.forumCredentials.password.includes(":")) {
            console.log("  - Migrating password encryption...");
            const decrypted = decryptOld(user.forumCredentials.password);
            
            if (decrypted) {
              user.forumCredentials.password = encryptNew(decrypted);
              needsUpdate = true;
            } else {
              console.log("  ⚠️  Failed to decrypt password, skipping");
              errorCount++;
            }
          } else if (user.forumCredentials.password && user.forumCredentials.password.includes(":")) {
            console.log("  ✓ Password already in new format");
            skippedCount++;
          }
          
          if (needsUpdate) {
            user.forumCredentials.updatedAt = new Date().toISOString();
            migratedCount++;
            console.log("  ✅ Migration completed for user");
          }
          
        } catch (error) {
          console.error(`  ❌ Error processing user ${username}:`, error.message);
          errorCount++;
        }
      } else {
        console.log(`\n👤 User ${username} has no forum credentials, skipping`);
        skippedCount++;
      }
    }
    
    // Save updated users file
    if (migratedCount > 0) {
      // Create backup first
      const backupFile = USERS_FILE + ".backup-" + Date.now();
      console.log(`\n📦 Creating backup at: ${backupFile}`);
      await fs.writeFile(backupFile, usersData);
      
      // Save migrated data
      console.log("💾 Saving migrated data...");
      await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2));
      console.log("✅ Migration saved successfully!");
    }
    
    // Summary
    console.log("\n" + "=".repeat(50));
    console.log("📊 Migration Summary:");
    console.log("=".repeat(50));
    console.log(`✅ Migrated: ${migratedCount} user(s)`);
    console.log(`⏭️  Skipped: ${skippedCount} item(s) (already in new format or no credentials)`);
    console.log(`❌ Errors: ${errorCount} item(s)`);
    console.log("=".repeat(50));
    
    if (migratedCount > 0) {
      console.log("\n🎉 Migration completed successfully!");
      console.log("You can now start the server normally with: npm start");
    } else if (skippedCount > 0 && errorCount === 0) {
      console.log("\n✅ No migration needed - all data already in new format!");
    } else if (errorCount > 0) {
      console.log("\n⚠️  Migration completed with errors. Some credentials may need to be re-entered.");
    }
    
  } catch (error) {
    console.error("\n❌ Migration failed:", error.message);
    process.exit(1);
  }
}

// Run migration
console.log("🔐 HV Forum Bot - Encryption Migration Tool");
console.log("=".repeat(50));
migrateEncryption();