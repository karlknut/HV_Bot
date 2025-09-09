// server/db/supabase.js - Fixed version with proper exports
const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
);

// Encryption class for credentials
class CredentialEncryption {
  constructor(key) {
    this.algorithm = "aes-256-gcm";
    this.key = crypto.createHash("sha256").update(String(key)).digest();
  }

  encrypt(text) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);

    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");

    const authTag = cipher.getAuthTag();

    return iv.toString("hex") + ":" + authTag.toString("hex") + ":" + encrypted;
  }

  decrypt(encryptedData) {
    const parts = encryptedData.split(":");
    const iv = Buffer.from(parts[0], "hex");
    const authTag = Buffer.from(parts[1], "hex");
    const encrypted = parts[2];

    const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  }
}

const encryption = new CredentialEncryption(process.env.ENCRYPTION_KEY);

// Database functions
const db = {
  // User Management
  async createUser(username, passwordHash) {
    const { data, error } = await supabase
      .from("users")
      .insert([
        {
          username,
          password_hash: passwordHash,
          created_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async getUserByUsername(username) {
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("username", username)
      .single();

    if (error && error.code !== "PGRST116") throw error; // PGRST116 = not found
    return data;
  },

  async updateUser(userId, updates) {
    const { data, error } = await supabase
      .from("users")
      .update(updates)
      .eq("id", userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Forum Credentials
  async saveForumCredentials(userId, forumUsername, forumPassword) {
    const encryptedUsername = encryption.encrypt(forumUsername);
    const encryptedPassword = encryption.encrypt(forumPassword);

    const { data, error } = await supabase
      .from("forum_credentials")
      .upsert([
        {
          user_id: userId,
          encrypted_username: encryptedUsername,
          encrypted_password: encryptedPassword,
          updated_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async getForumCredentials(userId) {
    const { data, error } = await supabase
      .from("forum_credentials")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (error && error.code !== "PGRST116") throw error;

    if (data) {
      try {
        return {
          username: encryption.decrypt(data.encrypted_username),
          password: encryption.decrypt(data.encrypted_password),
          updatedAt: data.updated_at,
        };
      } catch (decryptError) {
        console.error("Failed to decrypt credentials:", decryptError);
        return null;
      }
    }

    return null;
  },

  async deleteForumCredentials(userId) {
    const { error } = await supabase
      .from("forum_credentials")
      .delete()
      .eq("user_id", userId);

    if (error) throw error;
  },

  // Bot Statistics
  async getUserStats(userId) {
    const { data, error } = await supabase
      .from("user_stats")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (error && error.code !== "PGRST116") throw error;

    return (
      data || {
        user_id: userId,
        total_runs: 0,
        total_posts_updated: 0,
        total_comments_added: 0,
        last_run_date: null,
        last_run_status: "never_run",
      }
    );
  },

  async updateUserStats(userId, stats) {
    // First check if stats exist
    const { data: existing } = await supabase
      .from("user_stats")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (existing) {
      // Update existing record
      const { data, error } = await supabase
        .from("user_stats")
        .update({
          ...stats,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } else {
      // Insert new record
      const { data, error } = await supabase
        .from("user_stats")
        .insert([
          {
            user_id: userId,
            ...stats,
            updated_at: new Date().toISOString(),
          },
        ])
        .select()
        .single();

      if (error) throw error;
      return data;
    }
  },

  // Run History
  async addRunHistory(userId, runData) {
    const { data, error } = await supabase
      .from("run_history")
      .insert([
        {
          user_id: userId,
          run_date: runData.date || new Date().toISOString(),
          status: runData.status,
          posts_updated: runData.postsUpdated || 0,
          comments_added: runData.commentsAdded || 0,
          thread_titles: runData.threadTitles || [],
          error_message: runData.error || null,
          duration_seconds: runData.duration || null,
        },
      ])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async getRunHistory(userId, limit = 50) {
    const { data, error } = await supabase
      .from("run_history")
      .select("*")
      .eq("user_id", userId)
      .order("run_date", { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  },

  // Cleanup function for old runs
  async cleanupOldRuns(userId, keepCount = 50) {
    // Get all runs for user
    const { data: runs, error: fetchError } = await supabase
      .from("run_history")
      .select("id")
      .eq("user_id", userId)
      .order("run_date", { ascending: false });

    if (fetchError) throw fetchError;

    if (runs && runs.length > keepCount) {
      const idsToDelete = runs.slice(keepCount).map((r) => r.id);

      const { error: deleteError } = await supabase
        .from("run_history")
        .delete()
        .in("id", idsToDelete);

      if (deleteError) throw deleteError;
    }
  },
};

// IMPORTANT: Export the module
module.exports = { supabase, db, encryption };
