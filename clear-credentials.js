// clear-credentials.js - Clear corrupted forum credentials
const fs = require("fs").promises;
const path = require("path");

const USERS_FILE = path.join(__dirname, "data", "users.json");

async function clearCredentials() {
  console.log("🔧 Forum Credentials Reset Tool");
  console.log("=".repeat(50));
  console.log("\nThis will clear all stored forum credentials.");
  console.log("You'll need to re-enter them in the dashboard.\n");
  
  try {
    // Load users file
    console.log("📂 Loading users file...");
    const usersData = await fs.readFile(USERS_FILE, "utf8");
    const users = JSON.parse(usersData);
    
    // Create backup
    const backupFile = USERS_FILE + ".backup-" + Date.now();
    console.log(`📦 Creating backup at: ${backupFile}`);
    await fs.writeFile(backupFile, usersData);
    
    let clearedCount = 0;
    
    // Clear forum credentials for all users
    for (const username in users) {
      const user = users[username];
      
      if (user.forumCredentials) {
        console.log(`👤 Clearing credentials for user: ${username}`);
        user.forumCredentials = null;
        clearedCount++;
      }
    }
    
    // Save updated users file
    console.log("\n💾 Saving changes...");
    await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2));
    
    console.log("\n" + "=".repeat(50));
    console.log("✅ Success!");
    console.log("=".repeat(50));
    console.log(`Cleared credentials for ${clearedCount} user(s)`);
    console.log("\nNext steps:");
    console.log("1. Start the server: npm start");
    console.log("2. Login to the dashboard");
    console.log("3. Click 'Edit Credentials' or 'Set Forum Credentials'");
    console.log("4. Enter your forum username and password");
    console.log("\nYour credentials will be encrypted with the new secure method.");
    
  } catch (error) {
    console.error("\n❌ Error:", error.message);
    process.exit(1);
  }
}

// Run the script
clearCredentials();