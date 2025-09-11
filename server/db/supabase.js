// server/db/supabase.js - Fixed version with GPU functions merged into main db object
const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");
const { addRunHistory, getRunHistory } = require("../server");

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

// Main database functions
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

    if (error && error.code !== "PGRST116") throw error;
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
    const { data: existing } = await supabase
      .from("user_stats")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (existing) {
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
    const botType =
      runData.botType || (runData.gpusFound !== undefined ? "gpu" : "forum");

    const historyEntry = {
      user_id: userId,
      run_date: runData.date || new Date().toISOString(),
      status: runData.status,
      bot_type: botType,
      duration_seconds: runData.duration || null,
      error_message: runData.error || null,
    };

    if (botType === "gpu") {
      historyEntry.gpus_found = runData.gpusFound || 0;
      historyEntry.new_gpus = runData.newGPUs || 0;
      historyEntry.duplicates = runData.duplicates || 0;
      historyEntry.pages_scanned = runData.pagesScanned || 0;
    } else {
      historyEntry.posts_updated = runData.postsUpdated || 0;
      historyEntry.comments_added = runData.commentsAdded || 0;
      historyEntry.thread_titles = runData.threadTitles || [];
    }
    const { data, error } = await supabase
      .from("run_history")
      .insert([historyEntry])
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
    return (data || []).map((run) => ({
      date: run.run_date,
      status: run.status,
      botType: run.bot_type,
      duration: run.duration_seconds,
      error: run.error_message,
      // Forum bot fields
      postsUpdated: run.posts_updated,
      commentsAdded: run.comments_added,
      threadTitles: run.thread_titles,
      // GPU bot fields
      gpusFound: run.gpus_found,
      newGPUs: run.new_gpus,
      duplicates: run.duplicates,
      pagesScanned: run.pages_scanned,
    }));
  },

  async cleanupOldRuns(userId, keepCount = 50) {
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

  // =================== GPU TRACKING FUNCTIONS ===================

  async saveGPUListing(listing) {
    // Include location field
    const { data, error } = await supabase
      .from("gpu_listings")
      .insert([
        {
          model: listing.model,
          brand: listing.brand || this.extractBrand(listing.model),
          price: listing.price,
          currency: listing.currency,
          title: listing.title,
          url: listing.url,
          author: listing.author,
          location: listing.location, // Now included
          source: listing.source || "forum",
          scraped_at: listing.scraped_at || new Date().toISOString(),
          user_id: listing.user_id,
        },
      ])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async getGPUListings(filters = {}) {
    let query = supabase
      .from("gpu_listings")
      .select("*")
      .order("scraped_at", { ascending: false });

    if (filters.model) {
      query = query.ilike("model", `%${filters.model}%`);
    }

    if (filters.brand) {
      query = query.ilike("brand", `%${filters.brand}%`);
    }

    if (filters.minPrice) {
      query = query.gte("price", parseFloat(filters.minPrice));
    }

    if (filters.maxPrice) {
      query = query.lte("price", parseFloat(filters.maxPrice));
    }

    if (filters.currency) {
      query = query.eq("currency", filters.currency);
    }

    if (filters.limit) {
      query = query.limit(parseInt(filters.limit));
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async getGPUStats() {
    const { data, error } = await supabase
      .from("gpu_listings")
      .select("model, price, currency, scraped_at");

    if (error) throw error;

    // Group by model and calculate stats
    const modelStats = {};

    data.forEach((listing) => {
      if (!modelStats[listing.model]) {
        modelStats[listing.model] = {
          prices: [],
          count: 0,
          currencies: new Set(),
          latestDate: listing.scraped_at,
        };
      }

      modelStats[listing.model].prices.push(listing.price);
      modelStats[listing.model].count++;
      modelStats[listing.model].currencies.add(listing.currency);

      if (
        new Date(listing.scraped_at) >
        new Date(modelStats[listing.model].latestDate)
      ) {
        modelStats[listing.model].latestDate = listing.scraped_at;
      }
    });

    // Calculate averages, min, max for each model
    const results = Object.entries(modelStats).map(([model, stats]) => {
      const prices = stats.prices.sort((a, b) => a - b);
      const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;

      return {
        model,
        avgPrice: Math.round(avgPrice),
        minPrice: prices[0],
        maxPrice: prices[prices.length - 1],
        listingCount: stats.count,
        currencies: Array.from(stats.currencies),
        latestDate: stats.latestDate,
      };
    });

    return results.sort((a, b) => b.listingCount - a.listingCount);
  },

  async getGPUPriceHistory(model, days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { data, error } = await supabase
      .from("gpu_price_history")
      .select("*")
      .eq("gpu_model", model)
      .gte("date", startDate.toISOString().split("T")[0])
      .order("date", { ascending: true });

    if (error) throw error;
    return data || [];
  },

  async updateGPUPriceHistory() {
    // Calculate daily averages for the current day
    const today = new Date().toISOString().split("T")[0];

    const { data: listings } = await supabase
      .from("gpu_listings")
      .select("model, brand, price, currency")
      .gte("scraped_at", today);

    if (!listings || listings.length === 0) {
      console.log("No GPU listings found for today");
      return;
    }

    // Group by model and calculate stats
    const modelStats = {};
    listings.forEach((listing) => {
      const key = listing.model;
      if (!modelStats[key]) {
        modelStats[key] = {
          prices: [],
          brand: listing.brand || this.extractBrand(listing.model),
          currencies: new Set(),
        };
      }
      modelStats[key].prices.push(listing.price);
      modelStats[key].currencies.add(listing.currency);
    });

    // Save to price history using individual upserts
    for (const [model, stats] of Object.entries(modelStats)) {
      try {
        const prices = stats.prices.sort((a, b) => a - b);
        const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;

        const historyRecord = {
          gpu_model: model,
          brand: stats.brand,
          avg_price: Math.round(avgPrice),
          min_price: prices[0],
          max_price: prices[prices.length - 1],
          listing_count: stats.prices.length,
          currencies: Array.from(stats.currencies),
          date: today,
        };

        // Use individual upsert for each model
        const { error } = await supabase
          .from("gpu_price_history")
          .upsert([historyRecord], {
            onConflict: "gpu_model,date",
            ignoreDuplicates: false,
          });

        if (error) {
          console.error(`Error updating price history for ${model}:`, error);
          // Continue with other models even if one fails
        }
      } catch (modelError) {
        console.error(`Error processing model ${model}:`, modelError);
      }
    }

    console.log(
      `Updated price history for ${Object.keys(modelStats).length} GPU models`,
    );
  },

  // Price Alert Functions
  async createPriceAlert(userId, alertData) {
    const { data, error } = await supabase
      .from("gpu_price_alerts")
      .insert([
        {
          user_id: userId,
          gpu_model: alertData.gpuModel,
          target_price: alertData.targetPrice,
          currency: alertData.currency || "€",
          alert_type: alertData.alertType || "below", // 'below', 'above', 'exact'
          is_active: true,
          created_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async getUserPriceAlerts(userId) {
    const { data, error } = await supabase
      .from("gpu_price_alerts")
      .select("*")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async checkPriceAlerts() {
    // Get all active alerts
    const { data: alerts, error } = await supabase
      .from("gpu_price_alerts")
      .select(
        `
        *,
        users!inner(username)
      `,
      )
      .eq("is_active", true);

    if (error) throw error;
    if (!alerts || alerts.length === 0) return [];

    const triggeredAlerts = [];

    // Check each alert against recent listings
    for (const alert of alerts) {
      const { data: recentListings } = await supabase
        .from("gpu_listings")
        .select("*")
        .ilike("model", `%${alert.gpu_model}%`)
        .eq("currency", alert.currency)
        .gte(
          "scraped_at",
          new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        ) // Last 24 hours
        .order("scraped_at", { ascending: false });

      if (recentListings && recentListings.length > 0) {
        for (const listing of recentListings) {
          let triggered = false;

          switch (alert.alert_type) {
            case "below":
              triggered = listing.price <= alert.target_price;
              break;
            case "above":
              triggered = listing.price >= alert.target_price;
              break;
            case "exact":
              triggered =
                Math.abs(listing.price - alert.target_price) <=
                alert.target_price * 0.05; // 5% tolerance
              break;
          }

          if (triggered) {
            triggeredAlerts.push({
              alert,
              listing,
              username: alert.users.username,
            });

            // Log the triggered alert
            await supabase.from("alert_notifications").insert([
              {
                alert_id: alert.id,
                listing_id: listing.id,
                triggered_at: new Date().toISOString(),
                sent: false,
              },
            ]);

            break; // One trigger per alert check
          }
        }
      }
    }

    return triggeredAlerts;
  },

  // Utility function to extract brand from model name
  extractBrand(model) {
    if (!model) return "Unknown";

    const modelUpper = model.toUpperCase();

    if (
      modelUpper.includes("RTX") ||
      modelUpper.includes("GTX") ||
      modelUpper.includes("GEFORCE")
    ) {
      return "NVIDIA";
    }
    if (modelUpper.includes("RX") || modelUpper.includes("RADEON")) {
      return "AMD";
    }
    if (modelUpper.includes("ARC")) {
      return "Intel";
    }

    return "Unknown";
  },
};

module.exports = {
  supabase,
  db,
  encryption,
  addRunHistory,
  getRunHistory,
  migration,
};
