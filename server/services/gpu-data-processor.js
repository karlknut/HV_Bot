// server/services/gpu-data-processor.js - Complete fix with no IDs
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
        // CRITICAL: Remove any ID field that might exist
        const cleanListing = { ...listing };
        delete cleanListing.id;
        delete cleanListing.uniqueId;

        // Check for duplicate based on URL and model
        const isDuplicate = await this.checkDuplicate(
          cleanListing.url,
          cleanListing.model,
        );

        if (isDuplicate) {
          results.duplicates++;
          console.log(
            `Duplicate found (skipping): ${cleanListing.model} - ${cleanListing.url}`,
          );
          continue;
        }

        // Enhance listing data - explicitly without ID
        const enhancedListing = {
          model: cleanListing.model,
          full_model: cleanListing.full_model || cleanListing.model,
          normalized_model:
            cleanListing.normalized_model ||
            cleanListing.model.toUpperCase().replace(/\s+/g, "_"),
          brand: cleanListing.brand || this.detectBrand(cleanListing.model),
          variant: cleanListing.variant || null,
          price: cleanListing.price,
          currency: cleanListing.currency,
          ah_price: cleanListing.ah_price || null,
          ok_price: cleanListing.ok_price || null,
          title: cleanListing.title,
          url: cleanListing.url,
          author: cleanListing.author,
          location: cleanListing.location || null,
          forum_post_date: cleanListing.forum_post_date || null,
          source: cleanListing.source || "forum",
          scraped_at: cleanListing.scraped_at || new Date().toISOString(),
          user_id: userId,
        };

        // Save to database
        const saved = await this.saveGPUListingDirectly(enhancedListing);

        if (saved) {
          results.saved++;
          results.processed.push({
            id: saved.id, // Use the database-generated ID
            model: cleanListing.model,
            price: cleanListing.price,
            currency: cleanListing.currency,
          });

          console.log(
            `✅ Saved NEW listing: ${cleanListing.model} - ${cleanListing.price}${cleanListing.currency}`,
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
   * Save GPU listing directly without using db.saveGPUListing
   */
  async saveGPUListingDirectly(listing) {
    try {
      const { supabase } = this.db;

      console.log("Saving GPU listing (no ID):", {
        model: listing.model,
        url: listing.url,
        price: listing.price,
      });

      const { data, error } = await supabase
        .from("gpu_listings")
        .insert([
          {
            // NO ID FIELD - let database generate it
            model: listing.model,
            full_model: listing.full_model,
            normalized_model: listing.normalized_model,
            brand: listing.brand,
            variant: listing.variant,
            price: listing.price,
            currency: listing.currency,
            ah_price: listing.ah_price,
            ok_price: listing.ok_price,
            title: listing.title,
            url: listing.url,
            author: listing.author,
            location: listing.location,
            source: listing.source,
            forum_post_date: listing.forum_post_date,
            scraped_at: listing.scraped_at,
            user_id: listing.user_id,
          },
        ])
        .select()
        .single();

      if (error) {
        console.error("Database insert error:", error);
        throw error;
      }

      console.log("GPU listing saved with auto-generated ID:", data.id);
      return data;
    } catch (error) {
      console.error("saveGPUListingDirectly error:", error);
      throw error;
    }
  }

  /**
   * Check if listing already exists based on URL and model
   */
  async checkDuplicate(url, model) {
    try {
      const { supabase } = this.db;

      // Check if this exact listing already exists
      const { data, error } = await supabase
        .from("gpu_listings")
        .select("id")
        .eq("url", url)
        .eq("model", model)
        .single();

      if (data) {
        return true;
      }

      if (error && error.code === "PGRST116") {
        // No rows returned = not a duplicate
        return false;
      }

      return false;
    } catch (error) {
      console.error("Duplicate check error:", error);
      return false;
    }
  }

  /**
   * Clear all GPU listings from database
   */
  async clearAllListings() {
    try {
      const { supabase } = this.db;
      console.log("Starting to clear all GPU listings...");

      // First, get count of listings to be deleted
      const { count, error: countError } = await supabase
        .from("gpu_listings")
        .select("*", { count: "exact", head: true });

      if (countError) {
        console.error("Error getting count:", countError);
        throw countError;
      }

      console.log(`Found ${count} listings to delete`);

      if (count === 0) {
        console.log("No listings to delete");
        return true;
      }

      // Delete all GPU listings
      const { error } = await supabase
        .from("gpu_listings")
        .delete()
        .not("id", "is", null); // This matches all rows

      if (error) {
        console.error("Delete error:", error);
        throw error;
      }

      // Also clear price history
      try {
        const { error: historyError } = await supabase
          .from("gpu_price_history")
          .delete()
          .not("id", "is", null);

        if (historyError) {
          console.warn("Warning: Could not clear price history:", historyError);
        } else {
          console.log("Price history also cleared");
        }
      } catch (historyError) {
        console.warn("Warning: Could not clear price history:", historyError);
      }

      console.log(
        `Successfully cleared all GPU listings (${count} records deleted)`,
      );
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
      const { supabase } = this.db;

      const { data, error } = await supabase
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
      const { supabase } = this.db;
      let removed = 0;

      for (const dupGroup of stats.duplicates) {
        // Sort by scraped_at to keep the oldest
        const sorted = dupGroup.listings.sort(
          (a, b) => new Date(a.scraped_at) - new Date(b.scraped_at),
        );

        // Remove all except the first (oldest)
        for (let i = 1; i < sorted.length; i++) {
          const { error } = await supabase
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
      // Don't throw, just log the error
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
