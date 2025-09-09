// server/services/gpu-data-processor.js
class GPUDataProcessor {
  constructor(db) {
    this.db = db;
  }

  /**
   * Process and save scraped GPU data
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
      processed: []
    };

    for (const listing of gpuListings) {
      try {
        // Check if listing already exists (by URL)
        const existing = await this.checkDuplicate(listing.url);
        
        if (existing) {
          results.duplicates++;
          console.log(`Duplicate found: ${listing.model} - ${listing.url}`);
          continue;
        }

        // Enhance listing data
        const enhancedListing = {
          ...listing,
          user_id: userId,
          brand: listing.brand || this.detectBrand(listing.model),
          condition: this.detectCondition(listing.title + " " + listing.content),
          warranty: this.detectWarranty(listing.title + " " + listing.content),
          location: this.detectLocation(listing.title + " " + listing.content),
          source: "forum"
        };

        // Save to database
        const saved = await this.db.saveGPUListing(enhancedListing);
        
        if (saved) {
          results.saved++;
          results.processed.push({
            id: saved.id,
            model: listing.model,
            price: listing.price,
            currency: listing.currency
          });
          
          console.log(`✅ Saved: ${listing.model} - ${listing.price}${listing.currency}`);
        }
        
      } catch (error) {
        console.error(`Error processing listing: ${error.message}`);
        results.errors.push({
          listing: listing.model || listing.title,
          error: error.message
        });
      }
    }

    // Update price history after processing
    try {
      await this.updatePriceHistory();
    } catch (error) {
      console.error("Error updating price history:", error);
    }

    return results;
  }

  /**
   * Check if listing already exists
   */
  async checkDuplicate(url) {
    try {
      const { data } = await this.db.supabase
        .from("gpu_listings")
        .select("id")
        .eq("url", url)
        .single();
      
      return !!data;
    } catch (error) {
      // No duplicate found
      return false;
    }
  }

  /**
   * Detect GPU brand from model name
   */
  detectBrand(model) {
    if (!model) return "Unknown";
    
    const modelUpper = model.toUpperCase();
    
    if (modelUpper.includes("RTX") || modelUpper.includes("GTX") || modelUpper.includes("GEFORCE")) {
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

  /**
   * Detect condition from text
   */
  detectCondition(text) {
    const textLower = text.toLowerCase();
    
    if (textLower.includes("uus") || textLower.includes("new") || textLower.includes("avamata")) {
      return "new";
    }
    if (textLower.includes("vähe kasutatud") || textLower.includes("nagu uus")) {
      return "like-new";
    }
    if (textLower.includes("heas korras") || textLower.includes("korras")) {
      return "good";
    }
    if (textLower.includes("kasutatud")) {
      return "used";
    }
    
    return "unknown";
  }

  /**
   * Detect warranty info from text
   */
  detectWarranty(text) {
    const textLower = text.toLowerCase();
    
    if (textLower.includes("garantii")) {
      // Try to extract warranty duration
      const warrantyMatch = textLower.match(/(\d+)\s*(kuu|aasta|months?|years?)/);
      if (warrantyMatch) {
        const duration = warrantyMatch[1];
        const unit = warrantyMatch[2];
        
        if (unit.includes("aasta") || unit.includes("year")) {
          return `${duration} year(s)`;
        } else {
          return `${duration} month(s)`;
        }
      }
      return "yes";
    }
    
    return "unknown";
  }

  /**
   * Detect location from text
   */
  detectLocation(text) {
    const locations = [
      "Tallinn", "Tartu", "Narva", "Pärnu", "Kohtla-Järve",
      "Viljandi", "Rakvere", "Maardu", "Kuressaare", "Sillamäe",
      "Valga", "Võru", "Jõhvi", "Keila", "Haapsalu", "Paide"
    ];
    
    for (const location of locations) {
      if (text.includes(location)) {
        return location;
      }
    }
    
    return "Estonia";
  }

  /**
   * Update price history for all models
   */
  async updatePriceHistory() {
    try {
      await this.db.updateGPUPriceHistory();
      console.log("Price history updated");
    } catch (error) {
      console.error("Failed to update price history:", error);
      throw error;
    }
  }

  /**
   * Get market statistics
   */
  async getMarketStats() {
    try {
      const stats = await this.db.getGPUStats();
      
      // Calculate additional insights
      const insights = {
        totalModels: stats.length,
        averagePrice: this.calculateAverage(stats.map(s => s.avgPrice)),
        priceRange: {
          min: Math.min(...stats.map(s => s.minPrice)),
          max: Math.max(...stats.map(s => s.maxPrice))
        },
        topModels: stats.slice(0, 5).map(s => ({
          model: s.model,
          avgPrice: s.avgPrice,
          listings: s.listingCount
        })),
        brandDistribution: this.calculateBrandDistribution(stats)
      };
      
      return {
        stats,
        insights
      };
    } catch (error) {
      console.error("Error getting market stats:", error);
      throw error;
    }
  }

  /**
   * Calculate average
   */
  calculateAverage(numbers) {
    if (numbers.length === 0) return 0;
    return Math.round(numbers.reduce((a, b) => a + b, 0) / numbers.length);
  }

  /**
   * Calculate brand distribution
   */
  calculateBrandDistribution(stats) {
    const brands = {};
    
    for (const stat of stats) {
      const brand = this.detectBrand(stat.model);
      if (!brands[brand]) {
        brands[brand] = {
          count: 0,
          totalListings: 0
        };
      }
      brands[brand].count++;
      brands[brand].totalListings += stat.listingCount;
    }
    
    return brands;
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
              userId: alert.user_id
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