// server/services/gpu-data-processor.js - Fixed version
class GPUDataProcessor {
  constructor(db) {
    this.db = db;
  }

  /**
   * Process and save scraped GPU data with duplicate checking
   * @param {Array} gpuListings - Raw GPU listings from scraper
   * @param {string} userId - User who initiated the scan
   * @returns {Object} Processing results
   */
  async processAndSave(gpuListings, userId) {
    const results = {
      total: gpuListings.length,
      saved: 0,
      duplicates: 0,
      errors: [],
      processed: [],
    };

    for (const listing of gpuListings) {
      try {
        // Check for duplicate based on URL (which contains thread ID)
        const isDuplicate = await this.checkDuplicate(listing.url);

        if (isDuplicate) {
          results.duplicates++;
          console.log(
            `Duplicate found (skipping): ${listing.model} - ${listing.url}`,
          );
          continue;
        }

        // Enhance listing data
        const enhancedListing = {
          ...listing,
          user_id: userId,
          brand: listing.brand || this.detectBrand(listing.model),
          source: "forum",
          location: listing.location || null, // Ensure location is included
        };

        // Save to database
        const saved = await this.db.saveGPUListing(enhancedListing);

        if (saved) {
          results.saved++;
          results.processed.push({
            id: saved.id,
            model: listing.model,
            price: listing.price,
            currency: listing.currency,
          });

          console.log(
            `✅ Saved NEW listing: ${listing.model} - ${listing.price}${listing.currency}`,
          );
        }
      } catch (error) {
        console.error(`Error processing listing: ${error.message}`);
        results.errors.push({
          listing: listing.model || listing.title,
          error: error.message,
        });
      }
    }

    // Update price history after processing
    if (results.saved > 0) {
      try {
        await this.updatePriceHistory();
      } catch (error) {
        console.error("Error updating price history:", error);
      }
    }

    console.log(
      `Processing complete: ${results.saved} new, ${results.duplicates} duplicates, ${results.errors.length} errors`,
    );

    return results;
  }

  /**
   * Check if listing already exists based on URL
   */
  async checkDuplicate(url) {
    try {
      // Use Supabase to check if URL already exists
      const { data, error } = await this.db.supabase
        .from("gpu_listings")
        .select("id")
        .eq("url", url)
        .single();

      // If we get data back, it's a duplicate
      if (data) {
        return true;
      }

      // If error is "No rows found", it's not a duplicate
      if (error && error.code === "PGRST116") {
        return false;
      }

      // For any other error, assume not duplicate to allow saving
      return false;
    } catch (error) {
      // On error, assume not duplicate
      return false;
    }
  }

  /**
   * Clear all GPU listings from database (admin function)
   */
  async clearAllListings() {
    try {
      // Fixed: Use proper Supabase delete syntax
      const { error } = await this.db.supabase
        .from("gpu_listings")
        .delete()
        .gte("id", 0); // Delete all records

      if (error) throw error;

      console.log("All GPU listings cleared from database");
      return true;
    } catch (error) {
      console.error("Error clearing listings:", error);
      throw error;
    }
  }

  /**
   * Get duplicate statistics
   */
  async getDuplicateStats() {
    try {
      // Fixed: Use this.db.supabase instead of undefined supabase
      const { data, error } = await this.db.supabase
        .from("gpu_listings")
        .select("url, model, price, currency, id, scraped_at")
        .order("scraped_at", { ascending: false });

      if (error) throw error;

      // Group by URL to find duplicates
      const urlMap = {};
      data.forEach((item) => {
        if (!urlMap[item.url]) {
          urlMap[item.url] = [];
        }
        urlMap[item.url].push(item);
      });

      // Find URLs with duplicates
      const duplicates = Object.entries(urlMap)
        .filter(([url, items]) => items.length > 1)
        .map(([url, items]) => ({
          url,
          count: items.length,
          model: items[0].model,
          listings: items,
        }));

      return {
        totalListings: data.length,
        uniqueListings: Object.keys(urlMap).length,
        duplicateGroups: duplicates.length,
        totalDuplicates: data.length - Object.keys(urlMap).length,
        duplicates,
      };
    } catch (error) {
      console.error("Error getting duplicate stats:", error);
      throw error;
    }
  }

  /**
   * Remove duplicate listings, keeping only the oldest one
   */
  async removeDuplicates() {
    try {
      const stats = await this.getDuplicateStats();
      let removed = 0;

      for (const dupGroup of stats.duplicates) {
        // Sort by scraped_at to keep the oldest
        const sorted = dupGroup.listings.sort(
          (a, b) => new Date(a.scraped_at) - new Date(b.scraped_at),
        );

        // Remove all except the first (oldest)
        for (let i = 1; i < sorted.length; i++) {
          const { error } = await this.db.supabase
            .from("gpu_listings")
            .delete()
            .eq("id", sorted[i].id);

          if (!error) {
            removed++;
          }
        }
      }

      console.log(`Removed ${removed} duplicate listings`);
      return removed;
    } catch (error) {
      console.error("Error removing duplicates:", error);
      throw error;
    }
  }

  detectBrand(model) {
    if (!model) return "Unknown";

    const modelUpper = model.toUpperCase();

    if (modelUpper.includes("RTX") || modelUpper.includes("GTX")) {
      return "NVIDIA";
    }
    if (modelUpper.includes("RX") || modelUpper.includes("RADEON")) {
      return "AMD";
    }
    if (modelUpper.includes("ARC")) {
      return "Intel";
    }

    return "Unknown";
  }

  async updatePriceHistory() {
    try {
      await this.db.updateGPUPriceHistory();
      console.log("Price history updated");
    } catch (error) {
      console.error("Failed to update price history:", error);
      throw error;
    }
  }

  async getMarketStats() {
    try {
      const stats = await this.db.getGPUStats();

      const insights = {
        totalModels: stats.length,
        averagePrice:
          stats.length > 0
            ? Math.round(
                stats.reduce((a, s) => a + s.avgPrice, 0) / stats.length,
              )
            : 0,
        priceRange:
          stats.length > 0
            ? {
                min: Math.min(...stats.map((s) => s.minPrice)),
                max: Math.max(...stats.map((s) => s.maxPrice)),
              }
            : { min: 0, max: 0 },
        topModels: stats.slice(0, 5),
      };

      return {
        stats,
        insights,
      };
    } catch (error) {
      console.error("Error getting market stats:", error);
      throw error;
    }
  }

  /**
   * Check and trigger price alerts
   */
  async checkPriceAlerts(newListings) {
    try {
      const alerts = await this.db.checkPriceAlerts();
      const triggered = [];

      for (const alert of alerts) {
        for (const listing of newListings) {
          if (this.matchesAlert(listing, alert)) {
            triggered.push({
              alert,
              listing,
              userId: alert.user_id,
            });
          }
        }
      }

      return triggered;
    } catch (error) {
      console.error("Error checking price alerts:", error);
      return [];
    }
  }

  /**
   * Check if listing matches alert criteria
   */
  matchesAlert(listing, alert) {
    // Check if model matches
    if (!listing.model.toLowerCase().includes(alert.gpu_model.toLowerCase())) {
      return false;
    }

    // Check currency
    if (listing.currency !== alert.currency) {
      return false;
    }

    // Check price condition
    switch (alert.alert_type) {
      case "below":
        return listing.price <= alert.target_price;
      case "above":
        return listing.price >= alert.target_price;
      case "exact":
        const tolerance = alert.target_price * 0.05; // 5% tolerance
        return Math.abs(listing.price - alert.target_price) <= tolerance;
      default:
        return false;
    }
  }
}

module.exports = GPUDataProcessor;
