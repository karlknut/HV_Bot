const express = require("express");
const WebSocket = require("ws");
const http = require("http");
const path = require("path");
const fs = require("fs").promises;
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const Encryption = require("./utils/encryption");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Configuration
const PORT = process.env.PORT || 3000;
const JWT_SECRET =
  process.env.JWT_SECRET || crypto.randomBytes(64).toString("hex");
const ENCRYPTION_KEY =
  process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString("hex");
const USERS_FILE = path.join(__dirname, "..", "data", "users.json");
const STATS_DIR = path.join(__dirname, "..", "data", "user_stats");

// Initialize encryption
const encryption = new Encryption(ENCRYPTION_KEY);

// Store active connections and bot states per user
let wsConnections = new Map();
let botStates = new Map();

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

// User management functions
async function loadUsers() {
  try {
    const data = await fs.readFile(USERS_FILE, "utf8");
    return JSON.parse(data);
  } catch (error) {
    return {};
  }
}

async function saveUsers(users) {
  const dataDir = path.dirname(USERS_FILE);
  try {
    await fs.access(dataDir);
  } catch {
    await fs.mkdir(dataDir, { recursive: true });
  }
  await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2));
}

async function ensureStatsDir() {
  try {
    await fs.access(STATS_DIR);
  } catch {
    await fs.mkdir(STATS_DIR, { recursive: true });
  }
}

async function loadUserStats(userId) {
  try {
    const statsFile = path.join(STATS_DIR, `${userId}.json`);
    const data = await fs.readFile(statsFile, "utf8");
    return JSON.parse(data);
  } catch (error) {
    return {
      totalRuns: 0,
      totalPostsUpdated: 0,
      totalCommentsAdded: 0,
      lastRunDate: null,
      lastRunStatus: "never_run",
      runHistory: [],
    };
  }
}

async function saveUserStats(userId, stats) {
  await ensureStatsDir();
  const statsFile = path.join(STATS_DIR, `${userId}.json`);
  await fs.writeFile(statsFile, JSON.stringify(stats, null, 2));
}

// Serve pages with proper routing
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

// Debug page for authentication issues
app.get("/debug-auth", (req, res) => {
  res.sendFile(
    path.join(__dirname, "..", "public", "pages", "debug-auth.html"),
  );
});

// Authentication routes
app.post("/api/register", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res
        .status(400)
        .json({ success: false, error: "Username and password required" });
    }

    if (password.length < 8) {
      return res
        .status(400)
        .json({
          success: false,
          error: "Password must be at least 8 characters",
        });
    }

    const users = await loadUsers();

    if (users[username]) {
      return res
        .status(400)
        .json({ success: false, error: "Username already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    users[username] = {
      id: crypto.randomBytes(16).toString("hex"),
      username,
      password: hashedPassword,
      createdAt: new Date().toISOString(),
      forumCredentials: null,
    };

    await saveUsers(users);

    res.json({ success: true, message: "User registered successfully" });
  } catch (error) {
    console.error("Registration error:", error);
    res
      .status(500)
      .json({ success: false, error: "Registration failed: " + error.message });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    const users = await loadUsers();
    const user = users[username];

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res
        .status(401)
        .json({ success: false, error: "Invalid credentials" });
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
    res
      .status(500)
      .json({ success: false, error: "Login failed: " + error.message });
  }
});

// Protected API routes
app.get("/api/stats", authenticateToken, async (req, res) => {
  try {
    const stats = await loadUserStats(req.user.userId);

    // Get bot status from bot manager
    const botManager = require("./bot-manager");
    const botStatus = botManager.getStatus(req.user.userId);

    // Merge stats with current bot status
    const responseData = {
      ...stats,
      isRunning: botStatus.isRunning,
      currentStatus: botStatus.status,
    };

    res.json({ success: true, data: responseData });
  } catch (error) {
    console.error("Stats error:", error);
    res.status(500).json({ success: false, error: "Failed to load stats" });
  }
});

app.get("/api/forum-credentials", authenticateToken, async (req, res) => {
  try {
    const users = await loadUsers();
    const user = users[req.user.username];

    if (!user || !user.forumCredentials) {
      return res.json({
        success: true,
        data: {
          hasCredentials: false,
        },
      });
    }

    // Decrypt just the username for display (not the password)
    let forumUsername = null;
    try {
      forumUsername = encryption.decrypt(user.forumCredentials.username);
    } catch (error) {
      console.error("Error decrypting username for display:", error);
    }

    res.json({
      success: true,
      data: {
        hasCredentials: true,
        username: forumUsername, // Send decrypted username for display
        lastUpdated: user.forumCredentials.updatedAt,
      },
    });
  } catch (error) {
    console.error("Credentials fetch error:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to fetch credentials status" });
  }
});

app.post("/api/forum-credentials", authenticateToken, async (req, res) => {
  try {
    const { forumUsername, forumPassword } = req.body;

    if (!forumUsername || !forumPassword) {
      return res
        .status(400)
        .json({
          success: false,
          error: "Forum username and password required",
        });
    }

    const users = await loadUsers();
    const user = users[req.user.username];

    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    // Encrypt forum credentials using the fixed encryption
    user.forumCredentials = {
      username: encryption.encrypt(forumUsername),
      password: encryption.encrypt(forumPassword),
      updatedAt: new Date().toISOString(),
    };

    await saveUsers(users);

    res.json({
      success: true,
      message: "Forum credentials saved successfully",
    });
  } catch (error) {
    console.error("Credentials save error:", error);
    res
      .status(500)
      .json({
        success: false,
        error: "Failed to save credentials: " + error.message,
      });
  }
});

app.post("/api/start-bot", authenticateToken, async (req, res) => {
  const userId = req.user.userId;

  try {
    const botManager = require("./bot-manager");

    // Check if bot is already running
    if (botManager.isRunning(userId)) {
      return res.json({ success: false, message: "Bot is already running" });
    }

    const users = await loadUsers();
    const user = users[req.user.username];

    if (!user || !user.forumCredentials) {
      return res.json({
        success: false,
        message: "Forum credentials not found. Please set them first.",
      });
    }

    // Decrypt credentials
    const forumUsername = encryption.decrypt(user.forumCredentials.username);
    const forumPassword = encryption.decrypt(user.forumCredentials.password);

    // Use bot manager to start bot
    botManager.once("botStarted", (data) => {
      if (data.userId === userId) {
        broadcastToUser(userId, {
          type: "botStarted",
          data: { timestamp: data.timestamp },
        });
      }
    });

    botManager.once("botCompleted", async (data) => {
      if (data.userId === userId) {
        // Update stats
        const stats = await loadUserStats(userId);
        stats.totalPostsUpdated += data.stats.postsUpdated;
        stats.totalCommentsAdded += data.stats.commentsAdded;
        stats.lastRunStatus = "completed";

        if (!stats.runHistory) stats.runHistory = [];
        stats.runHistory.unshift({
          date: new Date().toISOString(),
          postsUpdated: data.stats.postsUpdated,
          commentsAdded: data.stats.commentsAdded,
          status: "completed",
        });
        stats.runHistory = stats.runHistory.slice(0, 50);

        await saveUserStats(userId, stats);

        broadcastToUser(userId, {
          type: "botCompleted",
          data: {
            timestamp: data.timestamp,
            postsUpdated: data.stats.postsUpdated,
            commentsAdded: data.stats.commentsAdded,
          },
        });
      }
    });

    botManager.once("botError", async (data) => {
      if (data.userId === userId) {
        // Update stats with error
        const stats = await loadUserStats(userId);
        stats.lastRunStatus = "error";

        if (!stats.runHistory) stats.runHistory = [];
        stats.runHistory.unshift({
          date: new Date().toISOString(),
          postsUpdated: 0,
          commentsAdded: 0,
          status: "error",
          error: data.error,
        });
        stats.runHistory = stats.runHistory.slice(0, 50);

        await saveUserStats(userId, stats);

        broadcastToUser(userId, {
          type: "botError",
          data: {
            timestamp: data.timestamp,
            error: data.error,
          },
        });
      }
    });

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
      forumUsername,
      forumPassword,
    );

    if (success) {
      // Update stats
      const stats = await loadUserStats(userId);
      stats.totalRuns += 1;
      stats.lastRunDate = new Date().toISOString();
      stats.lastRunStatus = "running";
      await saveUserStats(userId, stats);

      res.json({ success: true, message: "Bot started successfully" });
    } else {
      res.json({ success: false, message: "Failed to start bot" });
    }
  } catch (error) {
    console.error("Bot start error:", error);
    res
      .status(500)
      .json({
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
      return res.json({ success: false, message: "Bot is not running" });
    }

    const stopped = botManager.stopBot(userId);

    if (stopped) {
      // Update stats
      const stats = await loadUserStats(userId);
      stats.lastRunStatus = "stopped";
      await saveUserStats(userId, stats);

      res.json({ success: true, message: "Bot stopped successfully" });
    } else {
      res.json({ success: false, message: "Failed to stop bot" });
    }
  } catch (error) {
    console.error("Bot stop error:", error);
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to stop bot: " + error.message,
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
          const botState = botStates.get(user.userId) || { isRunning: false };
          ws.send(
            JSON.stringify({
              type: "statusUpdate",
              data: { isRunning: botState.isRunning },
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

// Run bot for specific user
async function runBotForUser(userId, forumUsername, forumPassword) {
  try {
    console.log(`Starting bot for user ${userId}`);

    // Import and run the bot function
    const { runForumBot } = require("../bot/hv_bot_module");

    const result = await runForumBot(
      forumUsername,
      forumPassword,
      (message) => {
        // Broadcast bot output to user's connections
        broadcastToUser(userId, {
          type: "botOutput",
          data: message,
        });
      },
    );

    // Bot completed successfully
    const botState = botStates.get(userId);
    if (botState) {
      botState.isRunning = false;
      botStates.set(userId, botState);
    }

    // Update stats with results
    const stats = await loadUserStats(userId);
    stats.totalPostsUpdated += result.postsUpdated || 0;
    stats.totalCommentsAdded += result.commentsAdded || 0;
    stats.lastRunStatus = "completed";

    // Add to run history
    if (!stats.runHistory) stats.runHistory = [];
    stats.runHistory.unshift({
      date: new Date().toISOString(),
      postsUpdated: result.postsUpdated || 0,
      commentsAdded: result.commentsAdded || 0,
      status: "completed",
    });

    // Keep only last 50 runs in history
    stats.runHistory = stats.runHistory.slice(0, 50);

    await saveUserStats(userId, stats);

    broadcastToUser(userId, {
      type: "botCompleted",
      data: {
        timestamp: new Date().toISOString(),
        postsUpdated: result.postsUpdated || 0,
        commentsAdded: result.commentsAdded || 0,
      },
    });

    console.log(`Bot completed successfully for user ${userId}`);
  } catch (error) {
    console.error(`Bot error for user ${userId}:`, error);

    const botState = botStates.get(userId);
    if (botState) {
      botState.isRunning = false;
      botStates.set(userId, botState);
    }

    // Update stats with error
    const stats = await loadUserStats(userId);
    stats.lastRunStatus = "error";

    if (!stats.runHistory) stats.runHistory = [];
    stats.runHistory.unshift({
      date: new Date().toISOString(),
      postsUpdated: 0,
      commentsAdded: 0,
      status: "error",
      error: error.message,
    });
    stats.runHistory = stats.runHistory.slice(0, 50);

    await saveUserStats(userId, stats);

    broadcastToUser(userId, {
      type: "botError",
      data: {
        timestamp: new Date().toISOString(),
        error: error.message,
      },
    });
  }
}

// Start server
server.listen(PORT, () => {
  console.log(
    `Multi-User HV Forum Bot Server running on http://localhost:${PORT}`,
  );
  console.log("Environment: " + (process.env.NODE_ENV || "development"));
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\nShutting down server...");

  // Stop all running bots using bot manager
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
