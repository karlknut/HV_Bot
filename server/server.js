// Load environment variables FIRST
require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
});

const express = require("express");
const WebSocket = require("ws");
const http = require("http");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const GPUForumScraper = require("./scrapers/gpu-forum-scraper");
const GPUDataProcessor = require("./services/gpu-data-processor");

// Import database functions
const { db, supabase } = require("./db/supabase");

// Create Express app
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Configuration
const PORT = process.env.PORT || 3000;
const JWT_SECRET =
  process.env.JWT_SECRET || crypto.randomBytes(64).toString("hex");

// Store active connections
let wsConnections = new Map();

// Middleware
app.use(express.json());
app.use("/css", express.static(path.join(__dirname, "..", "public", "css")));
app.use("/js", express.static(path.join(__dirname, "..", "public", "js")));
app.use(
  "/pages",
  express.static(path.join(__dirname, "..", "public", "pages")),
);

// Authentication middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Access token required" });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: "Invalid or expired token" });
    }
    req.user = user;
    next();
  });
}

// Serve pages
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "pages", "login.html"));
});

app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "pages", "login.html"));
});

app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "pages", "dashboard.html"));
});

app.get("/status", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "pages", "status.html"));
});

app.get("/gpu-tracker", (req, res) => {
  res.sendFile(
    path.join(__dirname, "..", "public", "pages", "gpu-tracker.html"),
  );
});

// Authentication routes
app.post("/api/register", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: "Username and password required",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        error: "Password must be at least 8 characters",
      });
    }

    // Check if user exists
    const existingUser = await db.getUserByUsername(username);
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: "Username already exists",
      });
    }

    // Hash password and create user
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await db.createUser(username, hashedPassword);

    res.json({
      success: true,
      message: "User registered successfully",
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({
      success: false,
      error: "Registration failed: " + error.message,
    });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = await db.getUserByUsername(username);

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({
        success: false,
        error: "Invalid credentials",
      });
    }

    const token = jwt.sign(
      { userId: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: "24h" },
    );

    res.json({
      success: true,
      token,
      user: { id: user.id, username: user.username },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      success: false,
      error: "Login failed: " + error.message,
    });
  }
});

// Protected API routes
app.get("/api/stats", authenticateToken, async (req, res) => {
  try {
    const stats = await db.getUserStats(req.user.userId);
    const runHistory = await db.getRunHistory(req.user.userId, 50);

    const botManager = require("./bot-manager");
    const botStatus = botManager.getStatus(req.user.userId);

    // Format run history properly
    const formattedHistory = runHistory.map((run) => ({
      date: run.date || run.run_date,
      status: run.status,
      botType: run.botType || (run.gpusFound !== undefined ? "gpu" : "forum"),
      postsUpdated: run.postsUpdated || 0,
      commentsAdded: run.commentsAdded || 0,
      gpusFound: run.gpusFound || 0,
      newGPUs: run.newGPUs || 0,
      threadTitles: run.threadTitles || [],
      error: run.error,
      duration: run.duration || 0,
    }));

    const responseData = {
      totalRuns: stats.total_runs,
      totalPostsUpdated: stats.total_posts_updated,
      totalCommentsAdded: stats.total_comments_added,
      lastRunDate: stats.last_run_date,
      lastRunStatus: stats.last_run_status,
      runHistory: formattedHistory,
      isRunning: botStatus.isRunning,
      currentStatus: botStatus.status,
    };

    res.json({ success: true, data: responseData });
  } catch (error) {
    console.error("Stats error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to load stats",
    });
  }
});

app.get("/api/forum-credentials", authenticateToken, async (req, res) => {
  try {
    const credentials = await db.getForumCredentials(req.user.userId);

    if (!credentials) {
      return res.json({
        success: true,
        data: {
          hasCredentials: false,
        },
      });
    }

    res.json({
      success: true,
      data: {
        hasCredentials: true,
        username: credentials.username,
        lastUpdated: credentials.updatedAt,
      },
    });
  } catch (error) {
    console.error("Credentials fetch error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch credentials status",
    });
  }
});

app.post("/api/forum-credentials", authenticateToken, async (req, res) => {
  try {
    const { forumUsername, forumPassword } = req.body;

    if (!forumUsername || !forumPassword) {
      return res.status(400).json({
        success: false,
        error: "Forum username and password required",
      });
    }

    await db.saveForumCredentials(
      req.user.userId,
      forumUsername,
      forumPassword,
    );

    res.json({
      success: true,
      message: "Forum credentials saved successfully",
    });
  } catch (error) {
    console.error("Credentials save error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to save credentials: " + error.message,
    });
  }
});

app.post("/api/start-bot", authenticateToken, async (req, res) => {
  const userId = req.user.userId;

  try {
    const botManager = require("./bot-manager");

    if (botManager.isRunning(userId)) {
      return res.json({
        success: false,
        message: "Bot is already running",
      });
    }

    const credentials = await db.getForumCredentials(userId);

    if (!credentials) {
      return res.json({
        success: false,
        message: "Forum credentials not found. Please set them first.",
      });
    }

    // Set up bot event handlers
    botManager.once("botStarted", (data) => {
      if (data.userId === userId) {
        broadcastToUser(userId, {
          type: "botStarted",
          data: { timestamp: data.timestamp },
        });
      }
    });

    // Store start time for duration calculation
    const botStartTime = Date.now();

    botManager.once("botCompleted", async (data) => {
      if (data.userId !== userId) return;

      try {
        // Calculate duration in seconds
        const duration = Math.round((Date.now() - botStartTime) / 1000);

        // Update stats in Supabase
        const stats = await db.getUserStats(userId);

        // Calculate new values
        const newStats = {
          total_runs: (stats.total_runs || 0) + 1,
          total_posts_updated:
            (stats.total_posts_updated || 0) + data.stats.postsUpdated,
          total_comments_added:
            (stats.total_comments_added || 0) + data.stats.commentsAdded,
          last_run_date: new Date().toISOString(),
          last_run_status: "completed",
        };

        await db.updateUserStats(userId, newStats);

        // Add to run history with thread titles and duration
        await db.addRunHistory(userId, {
          date: new Date().toISOString(),
          status: "completed",
          postsUpdated: data.stats.postsUpdated,
          commentsAdded: data.stats.commentsAdded,
          threadTitles: data.stats.threadTitles || [],
          duration: duration, // Add duration here
        });

        // Clean up old runs
        try {
          await db.cleanupOldRuns(userId, 50);
        } catch (cleanupError) {
          console.error("Error cleaning up old runs:", cleanupError);
        }

        broadcastToUser(userId, {
          type: "botCompleted",
          data: {
            timestamp: data.timestamp,
            postsUpdated: data.stats.postsUpdated,
            commentsAdded: data.stats.commentsAdded,
          },
        });

        console.log(
          `Bot completed for user ${userId}. Duration: ${duration}s, Thread titles:`,
          data.stats.threadTitles,
        );
      } catch (error) {
        console.error("Error handling bot completion:", error);

        broadcastToUser(userId, {
          type: "botCompleted",
          data: {
            timestamp: data.timestamp,
            postsUpdated: data.stats.postsUpdated || 0,
            commentsAdded: data.stats.commentsAdded || 0,
          },
        });
      }
    });

    botManager.once("botError", async (data) => {
      if (data.userId !== userId) return;

      try {
        // Update stats with error
        const stats = await db.getUserStats(userId);
        await db.updateUserStats(userId, {
          last_run_status: "error",
        });

        // Add error to run history
        await db.addRunHistory(userId, {
          date: new Date().toISOString(),
          status: "error",
          postsUpdated: 0,
          commentsAdded: 0,
          error: data.error,
        });

        broadcastToUser(userId, {
          type: "botError",
          data: {
            timestamp: data.timestamp,
            error: data.error,
          },
        });
      } catch (error) {
        console.error("Error handling bot error:", error);

        // Still notify the user even if database update failed
        broadcastToUser(userId, {
          type: "botError",
          data: {
            timestamp: data.timestamp,
            error: data.error || "Unknown error",
          },
        });
      }
    });

    // IMPORTANT: Add the botOutput handler here
    botManager.on("botOutput", (data) => {
      if (data.userId === userId) {
        broadcastToUser(userId, {
          type: "botOutput",
          data: data.message,
        });
      }
    });

    // Start the bot
    const success = await botManager.startBot(
      userId,
      credentials.username,
      credentials.password,
    );

    if (success) {
      // Don't increment stats here - wait for completion
      // Just update the status to running
      try {
        await db.updateUserStats(userId, {
          last_run_date: new Date().toISOString(),
          last_run_status: "running",
        });
      } catch (statsError) {
        console.error("Error updating initial stats:", statsError);
        // Don't fail the bot start if stats update fails
      }

      res.json({
        success: true,
        message: "Bot started successfully",
      });
    } else {
      res.json({
        success: false,
        message: "Failed to start bot",
      });
    }
  } catch (error) {
    console.error("Bot start error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to start bot: " + error.message,
    });
  }
});

app.post("/api/stop-bot", authenticateToken, async (req, res) => {
  const userId = req.user.userId;

  try {
    const botManager = require("./bot-manager");

    if (!botManager.isRunning(userId)) {
      return res.json({
        success: false,
        message: "Bot is not running",
      });
    }

    const stopped = botManager.stopBot(userId);

    if (stopped) {
      // Update stats
      await db.updateUserStats(userId, {
        last_run_status: "stopped",
      });

      res.json({
        success: true,
        message: "Bot stopped successfully",
      });
    } else {
      res.json({
        success: false,
        message: "Failed to stop bot",
      });
    }
  } catch (error) {
    console.error("Bot stop error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to stop bot: " + error.message,
    });
  }
});

app.post("/api/gpu/scan", authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const scanStartTime = Date.now();

  try {
    // Get forum credentials
    const credentials = await db.getForumCredentials(userId);
    if (!credentials) {
      return res.status(400).json({
        success: false,
        message:
          "Forum credentials required. Please set them in your dashboard.",
      });
    }

    // Broadcast scan start
    broadcastToUser(userId, {
      type: "gpuScanStarted",
      data: { timestamp: new Date().toISOString() },
    });

    // Create scraper instance with progress callback
    const scraper = new GPUForumScraper((message) => {
      // Send progress updates via WebSocket
      broadcastToUser(userId, {
        type: "gpuScanUpdate",
        data: message,
      });
    });

    // Run the scraper with better defaults
    console.log(`Starting GPU scan for user ${userId}`);
    const scrapeResult = await scraper.scrape(
      credentials.username,
      credentials.password,
      {
        maxPages: 10, // Scan up to 10 pages
        maxThreadsPerPage: 30, // Process up to 30 threads per page
        headless: false, // Set to true for production
      },
    );

    if (!scrapeResult.success) {
      // Add failed scan to history
      await db.addRunHistory(userId, {
        date: new Date().toISOString(),
        status: "error",
        botType: "gpu",
        error: scrapeResult.error,
        duration: Math.round((Date.now() - scanStartTime) / 1000),
      });

      return res.json({
        success: false,
        message: scrapeResult.error || "Scraping failed",
        partialResults: scrapeResult.data.length,
      });
    }

    // Process and save the data with duplicate checking
    const processor = new GPUDataProcessor(db);
    const saveResult = await processor.processAndSave(
      scrapeResult.data,
      userId,
    );

    // Calculate duration
    const duration = Math.round((Date.now() - scanStartTime) / 1000);

    // Add successful scan to history
    await db.addRunHistory(userId, {
      date: new Date().toISOString(),
      status: "completed",
      botType: "gpu",
      gpusFound: scrapeResult.totalListings,
      newGPUs: saveResult.saved,
      duplicates: saveResult.duplicates,
      pagesScanned: scrapeResult.processedPages || 0,
      duration: duration,
    });

    // Broadcast completion
    broadcastToUser(userId, {
      type: "gpuScanCompleted",
      data: {
        totalFound: scrapeResult.totalListings,
        saved: saveResult.saved,
        duplicates: saveResult.duplicates,
        timestamp: new Date().toISOString(),
      },
    });

    // Send success response
    res.json({
      success: true,
      data: {
        totalFound: scrapeResult.totalListings,
        saved: saveResult.saved,
        duplicates: saveResult.duplicates,
        errors: saveResult.errors,
      },
      message: `Found ${scrapeResult.totalListings} listings: ${saveResult.saved} new, ${saveResult.duplicates} duplicates skipped`,
    });
  } catch (error) {
    console.error("GPU scan error:", error);

    // Add error to history
    try {
      await db.addRunHistory(userId, {
        date: new Date().toISOString(),
        status: "error",
        botType: "gpu",
        error: error.message,
        duration: Math.round((Date.now() - scanStartTime) / 1000),
      });
    } catch (historyError) {
      console.error("Failed to save scan history:", historyError);
    }

    res.status(500).json({
      success: false,
      error: error.message,
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
      sortOrder = "desc",
    } = req.query;

    // Build query
    let query = supabase
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
      total: results.length,
    });
  } catch (error) {
    console.error("GPU listings error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      data: [], // Always return empty array on error
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
      insights: marketData.insights,
    });
  } catch (error) {
    console.error("GPU stats error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      data: [],
    });
  }
});

// Manual test endpoint for GPU scraping (development only)
app.get("/api/gpu/test-scrape", authenticateToken, async (req, res) => {
  if (process.env.NODE_ENV !== "development") {
    return res
      .status(403)
      .json({ error: "Test endpoint only available in development" });
  }

  const userId = req.user.userId;

  try {
    // Get forum credentials
    const credentials = await db.getForumCredentials(userId);
    if (!credentials) {
      return res.status(400).json({
        success: false,
        message: "Forum credentials required",
      });
    }

    // Create scraper with console output
    const scraper = new GPUForumScraper(console.log);

    // Run minimal scrape for testing
    const result = await scraper.scrape(
      credentials.username,
      credentials.password,
      {
        maxPages: 1, // Only first page
        maxThreadsPerPage: 5, // Only 5 threads
        headless: false,
      },
    );

    res.json({
      success: result.success,
      data: result.data,
      message: `Test scrape found ${result.data.length} listings`,
    });
  } catch (error) {
    console.error("Test scrape error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get GPU listings with enhanced filtering
// Add this debug version to your server API endpoint
// Replace the /api/gpu/listings endpoint with this debug version

app.get("/api/gpu/listings", authenticateToken, async (req, res) => {
  try {
    console.log("=== GPU LISTINGS API DEBUG ===");
    console.log("Request query:", req.query);

    const {
      model,
      brand,
      minPrice,
      maxPrice,
      currency,
      limit = 100,
      sortBy = "scraped_at",
      sortOrder = "desc",
    } = req.query;

    console.log("Parsed filters:", {
      model,
      brand,
      minPrice,
      maxPrice,
      currency,
      limit,
      sortBy,
      sortOrder,
    });

    const listings = await db.getGPUListings({
      model,
      brand,
      minPrice: minPrice ? parseFloat(minPrice) : null,
      maxPrice: maxPrice ? parseFloat(maxPrice) : null,
      currency,
      limit: parseInt(limit),
    });

    console.log("Raw database response:", listings);
    console.log(
      "Number of listings:",
      listings ? listings.length : "null/undefined",
    );

    if (!listings) {
      console.log("WARNING: Database returned null/undefined");
      return res.json({
        success: true,
        data: [],
        total: 0,
        debug: "Database returned null",
      });
    }

    if (!Array.isArray(listings)) {
      console.log("WARNING: Database returned non-array:", typeof listings);
      return res.json({
        success: true,
        data: [],
        total: 0,
        debug: `Database returned ${typeof listings}, not array`,
      });
    }

    // Sort listings
    listings.sort((a, b) => {
      let aVal = a[sortBy];
      let bVal = b[sortBy];

      if (sortBy === "price") {
        aVal = parseFloat(aVal) || 0;
        bVal = parseFloat(bVal) || 0;
      } else if (sortBy === "scraped_at") {
        aVal = new Date(aVal);
        bVal = new Date(bVal);
      }

      if (sortOrder === "asc") {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });

    console.log("Sorted listings sample:", listings.slice(0, 3));
    console.log("Sending response...");

    res.json({
      success: true,
      data: listings,
      total: listings.length,
      debug: {
        query: req.query,
        count: listings.length,
        sample: listings.slice(0, 2),
      },
    });
  } catch (error) {
    console.error("GPU listings error:", error);
    console.error("Error stack:", error.stack);

    res.status(500).json({
      success: false,
      error: error.message,
      debug: {
        stack: error.stack,
        query: req.query,
      },
    });
  }
});

// Get GPU market statistics and trends
app.get("/api/gpu/stats", authenticateToken, async (req, res) => {
  try {
    const stats = await db.getGPUStats();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error("GPU stats error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get price history for a specific GPU model
app.get(
  "/api/gpu/price-history/:model",
  authenticateToken,
  async (req, res) => {
    try {
      const { model } = req.params;
      const { days = 30 } = req.query;

      const history = await db.getGPUPriceHistory(model, parseInt(days));

      res.json({
        success: true,
        data: history,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  },
);

// Create price alert
app.post("/api/gpu/alerts", authenticateToken, async (req, res) => {
  try {
    const {
      gpuModel,
      targetPrice,
      currency = "€",
      alertType = "below",
    } = req.body;

    if (!gpuModel || !targetPrice) {
      return res.status(400).json({
        success: false,
        error: "GPU model and target price are required",
      });
    }

    const alert = await db.createPriceAlert(req.user.userId, {
      gpuModel,
      targetPrice: parseFloat(targetPrice),
      currency,
      alertType,
    });

    res.json({
      success: true,
      data: alert,
    });
  } catch (error) {
    console.error("Create alert error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get user's price alerts
app.get("/api/gpu/alerts", authenticateToken, async (req, res) => {
  try {
    const alerts = await db.getUserPriceAlerts(req.user.userId);

    res.json({
      success: true,
      data: alerts,
    });
  } catch (error) {
    console.error("Get alerts error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Delete price alert
app.delete("/api/gpu/alerts/:alertId", authenticateToken, async (req, res) => {
  try {
    const { alertId } = req.params;

    const { error } = await supabase
      .from("gpu_price_alerts")
      .update({ is_active: false })
      .eq("id", alertId)
      .eq("user_id", req.user.userId); // Ensure user can only delete their own alerts

    if (error) throw error;

    res.json({
      success: true,
      message: "Alert deleted successfully",
    });
  } catch (error) {
    console.error("Delete alert error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Market analysis endpoint
app.get("/api/gpu/market-analysis", authenticateToken, async (req, res) => {
  try {
    const { days = 7 } = req.query;

    // Get recent listings
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const { data: recentListings } = await supabase
      .from("gpu_listings")
      .select("*")
      .gte("scraped_at", startDate.toISOString());

    if (!recentListings || recentListings.length === 0) {
      return res.json({
        success: true,
        data: {
          message: "No recent listings found",
          trends: {},
          summary: {
            totalListings: 0,
            uniqueModels: 0,
            priceRange: { min: 0, max: 0 },
          },
        },
      });
    }

    // Use AI analysis from tracker
    const { GPUPriceTracker } = require("./gpu-tracker");
    const trends = GPUPriceTracker.analyzeMarketTrends(recentListings);

    // Calculate summary stats
    const allPrices = recentListings.map((l) => l.price);
    const uniqueModels = [...new Set(recentListings.map((l) => l.model))];

    const summary = {
      totalListings: recentListings.length,
      uniqueModels: uniqueModels.length,
      priceRange: {
        min: Math.min(...allPrices),
        max: Math.max(...allPrices),
      },
      averagePrice: Math.round(
        allPrices.reduce((a, b) => a + b, 0) / allPrices.length,
      ),
      analyzedPeriod: `${days} days`,
    };

    res.json({
      success: true,
      data: {
        trends,
        summary,
        topModels: Object.entries(trends)
          .sort(([, a], [, b]) => b.count - a.count)
          .slice(0, 10)
          .map(([model, data]) => ({ model, ...data })),
      },
    });
  } catch (error) {
    console.error("Market analysis error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.delete("/api/gpu/clear-all", authenticateToken, async (req, res) => {
  try {
    const processor = new GPUDataProcessor(db);
    await processor.clearAllListings();

    res.json({
      success: true,
      message: "All GPU listings cleared",
    });
  } catch (error) {
    console.error("Clear listings error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.get("/api/gpu/duplicates", authenticateToken, async (req, res) => {
  try {
    const processor = new GPUDataProcessor(db);
    const stats = await processor.getDuplicateStats();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error("Duplicate stats error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Remove duplicate listings
app.post("/api/gpu/remove-duplicates", authenticateToken, async (req, res) => {
  try {
    const processor = new GPUDataProcessor(db);
    const removed = await processor.removeDuplicates();

    res.json({
      success: true,
      message: `Removed ${removed} duplicate listings`,
    });
  } catch (error) {
    console.error("Remove duplicates error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// WebSocket handling
wss.on("connection", (ws, req) => {
  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);

      if (data.type === "auth" && data.token) {
        jwt.verify(data.token, JWT_SECRET, (err, user) => {
          if (err) {
            ws.send(
              JSON.stringify({ type: "error", message: "Invalid token" }),
            );
            ws.close();
            return;
          }

          ws.userId = user.userId;

          // Add to user's connection set
          if (!wsConnections.has(user.userId)) {
            wsConnections.set(user.userId, new Set());
          }
          wsConnections.get(user.userId).add(ws);

          // Send current bot status
          const botManager = require("./bot-manager");
          const botStatus = botManager.getStatus(user.userId);

          ws.send(
            JSON.stringify({
              type: "statusUpdate",
              data: { isRunning: botStatus.isRunning },
            }),
          );
        });
      }
    } catch (error) {
      console.error("WebSocket message error:", error);
    }
  });

  ws.on("close", () => {
    if (ws.userId) {
      const userConnections = wsConnections.get(ws.userId);
      if (userConnections) {
        userConnections.delete(ws);
        if (userConnections.size === 0) {
          wsConnections.delete(ws.userId);
        }
      }
    }
  });
});

// Broadcast message to all connections of a specific user
function broadcastToUser(userId, message) {
  const userConnections = wsConnections.get(userId);
  if (userConnections) {
    const messageStr = JSON.stringify(message);
    userConnections.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(messageStr);
      }
    });
  }
}

// Start server
server.listen(PORT, () => {
  console.log(
    `HV Forum Bot Server (Supabase) running on http://localhost:${PORT}`,
  );
  console.log("Environment: " + (process.env.NODE_ENV || "development"));
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\nShutting down server...");

  // Stop all running bots
  const botManager = require("./bot-manager");
  const stoppedCount = botManager.stopAllBots();
  console.log(`Stopped ${stoppedCount} running bot(s)`);

  // Close all WebSocket connections
  wsConnections.forEach((userConnections) => {
    userConnections.forEach((ws) => ws.close());
  });

  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});

module.exports = { app, server };
