const GPUForumScraper = require("../scrapers/gpu-forum-scraper");
const GPUDataProcessor = require("../services/gpu-data-processor");

app.post("/api/gpu/scan", authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  
  try {
    // Get forum credentials
    const credentials = await db.getForumCredentials(userId);
    if (!credentials) {
      return res.status(400).json({
        success: false,
        message: "Forum credentials required. Please set them in your dashboard."
      });
    }

    // Create scraper instance with progress callback
    const scraper = new GPUForumScraper((message) => {
      // Send progress updates via WebSocket
      broadcastToUser(userId, {
        type: "gpuScanUpdate",
        data: message
      });
    });

    // Run the scraper
    console.log(`Starting GPU scan for user ${userId}`);
    const scrapeResult = await scraper.scrape(
      credentials.username,
      credentials.password,
      {
        maxPages: 3,          // Scan first 3 pages
        maxThreadsPerPage: 20, // Process up to 20 threads per page
        headless: false        // Set to true for production
      }
    );

    if (!scrapeResult.success) {
      return res.json({
        success: false,
        message: scrapeResult.error || "Scraping failed",
        partialResults: scrapeResult.data.length
      });
    }

    // Process and save the data
    const processor = new GPUDataProcessor(db);
    const saveResult = await processor.processAndSave(scrapeResult.data, userId);

    // Check for triggered price alerts
    const triggeredAlerts = await processor.checkPriceAlerts(saveResult.processed);
    
    // Send notifications for triggered alerts
    for (const trigger of triggeredAlerts) {
      broadcastToUser(trigger.userId, {
        type: "priceAlert",
        data: {
          model: trigger.listing.model,
          price: trigger.listing.price,
          currency: trigger.listing.currency,
          targetPrice: trigger.alert.target_price,
          url: trigger.listing.url
        }
      });
    }

    // Send success response
    res.json({
      success: true,
      data: {
        totalFound: scrapeResult.totalListings,
        saved: saveResult.saved,
        duplicates: saveResult.duplicates,
        errors: saveResult.errors,
        triggeredAlerts: triggeredAlerts.length
      },
      message: `Successfully scraped ${scrapeResult.totalListings} listings, saved ${saveResult.saved} new entries`
    });

  } catch (error) {
    console.error("GPU scan error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get GPU listings - Fixed to properly return data
app.get("/api/gpu/listings", authenticateToken, async (req, res) => {
  try {
    const {
      model,
      minPrice,
      maxPrice,
      currency,
      limit = 100,
      sortBy = "scraped_at",
      sortOrder = "desc"
    } = req.query;

    // Build query
    let query = db.supabase
      .from("gpu_listings")
      .select("*")
      .order(sortBy, { ascending: sortOrder === "asc" });

    // Apply filters
    if (model) {
      query = query.ilike("model", `%${model}%`);
    }
    
    if (minPrice) {
      query = query.gte("price", parseFloat(minPrice));
    }
    
    if (maxPrice) {
      query = query.lte("price", parseFloat(maxPrice));
    }
    
    if (currency) {
      query = query.eq("currency", currency);
    }
    
    // Limit results
    query = query.limit(parseInt(limit));

    // Execute query
    const { data: listings, error } = await query;
    
    if (error) {
      console.error("Database query error:", error);
      throw error;
    }

    // Ensure we always return an array
    const results = listings || [];
    
    console.log(`Returning ${results.length} GPU listings`);

    res.json({
      success: true,
      data: results,
      total: results.length
    });

  } catch (error) {
    console.error("GPU listings error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      data: [] // Always return empty array on error
    });
  }
});

// Get GPU statistics
app.get("/api/gpu/stats", authenticateToken, async (req, res) => {
  try {
    const processor = new GPUDataProcessor(db);
    const marketData = await processor.getMarketStats();
    
    res.json({
      success: true,
      data: marketData.stats,
      insights: marketData.insights
    });
    
  } catch (error) {
    console.error("GPU stats error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      data: []
    });
  }
});

// Manual test endpoint for GPU scraping (development only)
app.get("/api/gpu/test-scrape", authenticateToken, async (req, res) => {
  if (process.env.NODE_ENV !== "development") {
    return res.status(403).json({ error: "Test endpoint only available in development" });
  }
  
  const userId = req.user.userId;
  
  try {
    // Get forum credentials
    const credentials = await db.getForumCredentials(userId);
    if (!credentials) {
      return res.status(400).json({
        success: false,
        message: "Forum credentials required"
      });
    }

    // Create scraper with console output
    const scraper = new GPUForumScraper(console.log);
    
    // Run minimal scrape for testing
    const result = await scraper.scrape(
      credentials.username,
      credentials.password,
      {
        maxPages: 1,          // Only first page
        maxThreadsPerPage: 5,  // Only 5 threads
        headless: false
      }
    );
    
    res.json({
      success: result.success,
      data: result.data,
      message: `Test scrape found ${result.data.length} listings`
    });
    
  } catch (error) {
    console.error("Test scrape error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});