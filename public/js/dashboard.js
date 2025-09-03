// Enhanced Dashboard with Modal System and Better State Management
(function () {
  "use strict";

  let wsConnected = false;
  let hasForumCredentials = false;
  let forumUsername = null;

  function init() {
    console.log("Dashboard initializing...");

    // Check authentication
    if (!Auth.isAuthenticated()) {
      window.location.href = "/";
      return;
    }

    // Display user info
    const user = Auth.getUser();
    if (!user || !user.username) {
      Auth.logout();
      return;
    }

    // Setup user display
    setupUserDisplay(user);

    // Initialize WebSocket
    WS.init(handleWebSocketMessage);

    // Load initial data
    loadStats();
    loadCredentialsStatus();

    // Setup event listeners
    setupEventListeners();

    // Auto-refresh stats
    setInterval(loadStats, 30000);
  }

  function setupUserDisplay(user) {
    // Update header user info
    const userNameElement = document.getElementById("userName");
    const userAvatar = document.getElementById("userAvatar");

    if (userNameElement) {
      userNameElement.textContent = user.username;
    }

    if (userAvatar) {
      // Set avatar initials
      userAvatar.textContent = user.username.substring(0, 2).toUpperCase();
    }
  }

  function setupEventListeners() {
    // Start bot button
    const startBtn = document.getElementById("startButton");
    if (startBtn) {
      startBtn.addEventListener("click", handleStartBot);
    }

    // Stop bot button
    const stopBtn = document.getElementById("stopButton");
    if (stopBtn) {
      stopBtn.addEventListener("click", handleStopBot);
    }

    // Logout button
    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", handleLogout);
    }

    // Edit credentials button
    const editCredsBtn = document.getElementById("editCredentialsBtn");
    if (editCredsBtn) {
      editCredsBtn.addEventListener("click", showCredentialsForm);
    }

    // Save credentials button
    const saveCredsBtn = document.getElementById("saveCredentialsBtn");
    if (saveCredsBtn) {
      saveCredsBtn.addEventListener("click", handleSaveCredentials);
    }
  }

  function handleWebSocketMessage(message) {
    console.log("WebSocket message:", message);

    switch (message.type) {
      case "botStarted":
        updateBotStatus(true);
        Toast.success("Bot Started", "Your bot is now running");
        break;

      case "botCompleted":
        updateBotStatus(false);
        loadStats();
        Toast.success(
          "Bot Completed",
          `Updated ${message.data.postsUpdated || 0} posts, added ${message.data.commentsAdded || 0} comments`,
        );
        break;

      case "botStopped":
        updateBotStatus(false);
        loadStats();
        Toast.info("Bot Stopped", "Bot has been stopped");
        break;

      case "botError":
        updateBotStatus(false);
        loadStats();
        Toast.error("Bot Error", message.data.error || "An error occurred");
        break;

      case "statusUpdate":
        updateBotStatus(message.data.isRunning);
        break;
    }
  }

  function updateBotStatus(running) {
    const startButton = document.getElementById("startButton");
    const stopButton = document.getElementById("stopButton");
    const runningIndicator = document.getElementById("botRunningIndicator");
    const statusBadge = document.getElementById("statusBadge");

    if (running) {
      if (startButton) {
        startButton.disabled = true;
        startButton.innerHTML = "<span>⏸️ Bot Running...</span>";
      }
      if (stopButton) {
        stopButton.disabled = false;
      }
      if (runningIndicator) {
        runningIndicator.style.display = "flex";
      }
      if (statusBadge) {
        statusBadge.className = "status-badge running";
        statusBadge.textContent = "Running";
      }
    } else {
      if (startButton) {
        startButton.disabled = !hasForumCredentials;
        startButton.innerHTML = "<span>🚀 Start Bot</span>";
      }
      if (stopButton) {
        stopButton.disabled = true;
      }
      if (runningIndicator) {
        runningIndicator.style.display = "none";
      }
      if (statusBadge) {
        statusBadge.className = "status-badge idle";
        statusBadge.textContent = "Idle";
      }
    }
  }

  async function loadStats() {
    try {
      const result = await API.get("/api/stats");
      if (result && result.success && result.data) {
        updateStatsDisplay(result.data);
      }
    } catch (error) {
      console.error("Error loading stats:", error);
    }
  }

  async function loadCredentialsStatus() {
    try {
      const result = await API.get("/api/forum-credentials");
      if (result && result.success && result.data) {
        updateCredentialsDisplay(result.data);
      }
    } catch (error) {
      console.error("Error loading credentials status:", error);
    }
  }

  function updateCredentialsDisplay(data) {
    hasForumCredentials = data.hasCredentials;

    const credentialsCard = document.getElementById("credentialsCard");
    const credentialsForm = document.getElementById("credentialsForm");
    const startButton = document.getElementById("startButton");

    if (hasForumCredentials) {
      // Show logged in state
      if (credentialsCard) {
        credentialsCard.style.display = "block";
      }
      if (credentialsForm) {
        credentialsForm.style.display = "none";
      }

      // Update credentials info
      if (data.username) {
        forumUsername = data.username;
        const usernameElement = document.getElementById("forumUsernameDisplay");
        if (usernameElement) {
          usernameElement.textContent = forumUsername;
        }
      }

      if (data.lastUpdated) {
        const lastUpdatedElement = document.getElementById(
          "credentialsLastUpdated",
        );
        if (lastUpdatedElement) {
          lastUpdatedElement.textContent = formatTimeAgo(data.lastUpdated);
        }
      }

      // Enable start button
      if (startButton && !startButton.disabled) {
        startButton.disabled = false;
      }
    } else {
      // Show credentials form
      if (credentialsCard) {
        credentialsCard.style.display = "none";
      }
      if (credentialsForm) {
        credentialsForm.style.display = "block";
      }

      // Disable start button
      if (startButton) {
        startButton.disabled = true;
      }
    }
  }

  function updateStatsDisplay(stats) {
    const formattedStats = Stats.formatStatsDisplay(stats);

    // Update stat cards
    document.getElementById("totalRuns").textContent = formattedStats.totalRuns;
    document.getElementById("totalPosts").textContent =
      formattedStats.totalPostsUpdated;
    document.getElementById("totalComments").textContent =
      formattedStats.totalCommentsAdded;
    document.getElementById("lastRun").textContent = formattedStats.lastRun;

    // Update bot status
    updateBotStatus(formattedStats.isRunning);
  }

  function showCredentialsForm() {
    const credentialsForm = document.getElementById("credentialsForm");
    const credentialsCard = document.getElementById("credentialsCard");

    if (credentialsForm) {
      credentialsForm.style.display = "block";
    }
    if (credentialsCard) {
      credentialsCard.style.display = "none";
    }

    // Pre-fill username if available
    if (forumUsername) {
      const usernameInput = document.getElementById("forumUsername");
      if (usernameInput) {
        usernameInput.value = forumUsername;
      }
    }
  }

  async function handleSaveCredentials() {
    const username = document.getElementById("forumUsername").value.trim();
    const password = document.getElementById("forumPassword").value;

    if (!username || !password) {
      Toast.warning(
        "Missing Information",
        "Please enter both username and password",
      );
      return;
    }

    UI.showLoading(true);

    try {
      const result = await API.post("/api/forum-credentials", {
        forumUsername: username,
        forumPassword: password,
      });

      if (result && result.success) {
        Toast.success(
          "Credentials Saved",
          "Your forum credentials have been updated",
        );
        document.getElementById("forumPassword").value = "";
        loadCredentialsStatus();
      } else {
        Toast.error(
          "Save Failed",
          result.error || "Failed to save credentials",
        );
      }
    } catch (error) {
      Toast.error("Error", "Failed to save credentials");
    } finally {
      UI.showLoading(false);
    }
  }

  async function handleStartBot() {
    Modal.confirm(
      "Start Bot?",
      "The bot will begin updating your forum posts and adding comments. This may take a few minutes.",
      async () => {
        UI.showLoading(true);

        try {
          const result = await API.post("/api/start-bot", {});

          if (!result.success) {
            Toast.error(
              "Start Failed",
              result.data?.message || result.error || "Failed to start bot",
            );
          }
        } catch (error) {
          Toast.error("Error", "Failed to start bot");
        } finally {
          UI.showLoading(false);
        }
      },
    );
  }

  async function handleStopBot() {
    Modal.danger(
      "Stop Bot?",
      "Are you sure you want to stop the bot? Any ongoing operations will be cancelled.",
      async () => {
        UI.showLoading(true);

        try {
          const result = await API.post("/api/stop-bot", {});

          if (!result.success) {
            Toast.error(
              "Stop Failed",
              result.data?.message || result.error || "Failed to stop bot",
            );
          }
        } catch (error) {
          Toast.error("Error", "Failed to stop bot");
        } finally {
          UI.showLoading(false);
        }
      },
    );
  }

  function handleLogout() {
    Modal.danger(
      "Logout?",
      "Are you sure you want to logout? Any running bot operations will continue.",
      () => {
        WS.close();
        Auth.logout();
      },
    );
  }

  function formatTimeAgo(date) {
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);

    const intervals = {
      year: 31536000,
      month: 2592000,
      week: 604800,
      day: 86400,
      hour: 3600,
      minute: 60,
    };

    for (const [name, value] of Object.entries(intervals)) {
      const interval = Math.floor(seconds / value);
      if (interval >= 1) {
        return interval === 1 ? `1 ${name} ago` : `${interval} ${name}s ago`;
      }
    }

    return "Just now";
  }

  // Initialize when DOM is loaded
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
