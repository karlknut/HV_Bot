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

// Import database functions
const { db } = require("./db/supabase");

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
  res.sendFile(path.join(__dirname, "..", "public", "pages", "gpu-tracker.html"));
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

    // Get bot status from bot manager
    const botManager = require("./bot-manager");
    const botStatus = botManager.getStatus(req.user.userId);

    // Format response
    const responseData = {
      totalRuns: stats.total_runs,
      totalPostsUpdated: stats.total_posts_updated,
      totalCommentsAdded: stats.total_comments_added,
      lastRunDate: stats.last_run_date,
      lastRunStatus: stats.last_run_status,
      runHistory: runHistory.map((run) => ({
        date: run.run_date,
        status: run.status,
        postsUpdated: run.posts_updated,
        commentsAdded: run.comments_added,
        threadTitles: run.thread_titles || [],
        error: run.error_message,
        duration: run.duration_seconds,
      })),
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
  
  try {
    const GPUPriceTracker = require("./gpu-tracker");
    const tracker = new GPUPriceTracker((message) => {
      // Send progress updates via WebSocket
      broadcastToUser(userId, {
        type: "gpuScanUpdate",
        data: message
      });
    });
    
    // Get forum credentials
    const credentials = await db.getForumCredentials(userId);
    if (!credentials) {
      return res.json({
        success: false,
        message: "Forum credentials required"
      });
    }
    
    // Run the GPU scanner
    const result = await tracker.run(credentials.username, credentials.password);
    
    if (result.success) {
      // Save to database
      for (const gpu of result.data) {
        await db.saveGPUListing(gpu);
      }
      
      // Update price history
      await db.updateGPUPriceHistory();
    }
    
    res.json(result);
  } catch (error) {
    console.error("GPU scan error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get("/api/gpu/listings", authenticateToken, async (req, res) => {
  try {
    const { model, minPrice, maxPrice, currency, limit = 50 } = req.query;
    
    const listings = await db.getGPUListings({
      model,
      minPrice: minPrice ? parseFloat(minPrice) : null,
      maxPrice: maxPrice ? parseFloat(maxPrice) : null,
      currency,
      limit: parseInt(limit)
    });
    
    res.json({
      success: true,
      data: listings
    });
  } catch (error) {
    console.error("GPU listings error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get("/api/gpu/models", authenticateToken, async (req, res) => {
  try {
    const models = await db.getGPUModels();
    res.json({
      success: true,
      data: models
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get("/api/gpu/price-history/:model", authenticateToken, async (req, res) => {
  try {
    const { model } = req.params;
    const { days = 30 } = req.query;
    
    const history = await db.getGPUPriceHistory(model, parseInt(days));
    
    res.json({
      success: true,
      data: history
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
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
