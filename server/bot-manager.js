// bot-manager.js - Fixed with thread title support
const EventEmitter = require("events");
const path = require("path");

class BotManager extends EventEmitter {
  constructor() {
    super();
    this.bots = new Map(); // userId -> { process, status, startTime }
    this.stats = new Map(); // userId -> { postsUpdated, commentsAdded, threadTitles }
  }

  /**
   * Start a bot for a specific user
   * @param {string} userId - User ID
   * @param {string} username - Forum username
   * @param {string} password - Forum password
   * @returns {Promise<boolean>} Success status
   */
  async startBot(userId, username, password) {
    // Check if bot is already running
    if (this.isRunning(userId)) {
      this.emit("error", { userId, error: "Bot is already running" });
      return false;
    }

    try {
      // Import the bot module
      const { runForumBot } = require("../bot/hv_bot_module");

      // Initialize bot state
      this.bots.set(userId, {
        process: null,
        status: "starting",
        startTime: new Date(),
      });

      this.stats.set(userId, {
        postsUpdated: 0,
        commentsAdded: 0,
        threadTitles: [],
      });

      // Emit bot started event
      this.emit("botStarted", {
        userId,
        timestamp: new Date().toISOString(),
      });

      // Run the bot with progress callback
      const result = await runForumBot(username, password, (message) => {
        this.emit("botOutput", { userId, message });
      });

      // Update stats with actual thread titles
      this.stats.set(userId, {
        postsUpdated: result.postsUpdated || 0,
        commentsAdded: result.commentsAdded || 0,
        threadTitles: result.threadTitles || [], // Make sure threadTitles are included
      });

      // Update bot state
      const bot = this.bots.get(userId);
      if (bot) {
        bot.status = "completed";
      }

      // Emit completion event with thread titles
      this.emit("botCompleted", {
        userId,
        timestamp: new Date().toISOString(),
        stats: {
          postsUpdated: result.postsUpdated || 0,
          commentsAdded: result.commentsAdded || 0,
          threadTitles: result.threadTitles || [],
        },
      });

      return true;
    } catch (error) {
      console.error(`Bot error for user ${userId}:`, error);

      // Update bot state
      const bot = this.bots.get(userId);
      if (bot) {
        bot.status = "error";
        bot.error = error.message;
      }

      // Emit error event
      this.emit("botError", {
        userId,
        timestamp: new Date().toISOString(),
        error: error.message,
      });

      return false;
    } finally {
      // Clean up bot entry after a delay
      setTimeout(() => {
        this.bots.delete(userId);
      }, 5000);
    }
  }

  /**
   * Stop a bot for a specific user
   * @param {string} userId - User ID
   * @returns {boolean} Success status
   */
  stopBot(userId) {
    const bot = this.bots.get(userId);

    if (!bot || bot.status !== "running") {
      return false;
    }

    try {
      if (bot.process) {
        bot.process.kill("SIGTERM");
      }

      bot.status = "stopped";

      this.emit("botStopped", {
        userId,
        timestamp: new Date().toISOString(),
      });

      // Clean up
      this.bots.delete(userId);

      return true;
    } catch (error) {
      console.error(`Error stopping bot for user ${userId}:`, error);
      return false;
    }
  }

  /**
   * Check if bot is running for a user
   * @param {string} userId - User ID
   * @returns {boolean} Running status
   */
  isRunning(userId) {
    const bot = this.bots.get(userId);
    return bot && (bot.status === "running" || bot.status === "starting");
  }

  /**
   * Get bot status for a user
   * @param {string} userId - User ID
   * @returns {Object} Bot status
   */
  getStatus(userId) {
    const bot = this.bots.get(userId);
    const stats = this.stats.get(userId);

    if (!bot) {
      return {
        isRunning: false,
        status: "idle",
        stats: stats || { postsUpdated: 0, commentsAdded: 0, threadTitles: [] },
      };
    }

    return {
      isRunning: this.isRunning(userId),
      status: bot.status,
      startTime: bot.startTime,
      error: bot.error,
      stats: stats || { postsUpdated: 0, commentsAdded: 0, threadTitles: [] },
    };
  }

  /**
   * Get all running bots
   * @returns {Array} List of user IDs with running bots
   */
  getRunningBots() {
    const running = [];

    for (const [userId, bot] of this.bots) {
      if (this.isRunning(userId)) {
        running.push({
          userId,
          status: bot.status,
          startTime: bot.startTime,
        });
      }
    }

    return running;
  }

  /**
   * Stop all running bots
   * @returns {number} Number of bots stopped
   */
  stopAllBots() {
    let stopped = 0;

    for (const [userId, bot] of this.bots) {
      if (this.isRunning(userId)) {
        if (this.stopBot(userId)) {
          stopped++;
        }
      }
    }

    return stopped;
  }

  /**
   * Clean up completed or errored bots
   */
  cleanup() {
    const now = Date.now();
    const timeout = 5 * 60 * 1000; // 5 minutes

    for (const [userId, bot] of this.bots) {
      if (
        bot.status === "completed" ||
        bot.status === "error" ||
        bot.status === "stopped"
      ) {
        const elapsed = now - bot.startTime.getTime();
        if (elapsed > timeout) {
          this.bots.delete(userId);
          this.stats.delete(userId);
        }
      }
    }
  }

  /**
   * Get statistics for all users
   * @returns {Object} Statistics object
   */
  getAllStats() {
    const stats = {
      totalRunning: 0,
      totalCompleted: 0,
      totalErrors: 0,
      users: {},
    };

    for (const [userId, bot] of this.bots) {
      if (bot.status === "running" || bot.status === "starting") {
        stats.totalRunning++;
      } else if (bot.status === "completed") {
        stats.totalCompleted++;
      } else if (bot.status === "error") {
        stats.totalErrors++;
      }

      stats.users[userId] = this.getStatus(userId);
    }

    return stats;
  }
}

// Create singleton instance
const botManager = new BotManager();

// Periodic cleanup
setInterval(() => {
  botManager.cleanup();
}, 60000); // Run every minute

module.exports = botManager;
