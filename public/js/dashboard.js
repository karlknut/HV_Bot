// Dashboard with enhanced debugging for credentials issue
(function () {
  "use strict";

  let wsConnected = false;
  let hasForumCredentials = false;
  let forumUsername = null;
  let isBotRunning = false;

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

    // Edit credentials button - now shows modal
    const editCredsBtn = document.getElementById("editCredentialsBtn");
    if (editCredsBtn) {
      editCredsBtn.addEventListener("click", showCredentialsForm);
    }

    // Save credentials button (if inline form is still visible)
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
    console.log("Updating bot status to:", running);
    isBotRunning = running;
    const startButton = document.getElementById("startButton");
    const stopButton = document.getElementById("stopButton");
    const runningIndicator = document.getElementById("botRunningIndicator");

    if (running) {
      if (startButton) {
        startButton.disabled = true;
        startButton.innerHTML = '<span class="btn-icon">⏸️</span><span class="btn-text">Bot Running...</span>';
      }
      if (stopButton) {
        stopButton.disabled = false;
      }
      if (runningIndicator) {
        runningIndicator.style.display = "flex";
      }
    } else {
      if (startButton) {
        // Only enable if we have credentials
        console.log("Setting start button disabled state to:", !hasForumCredentials);
        startButton.disabled = !hasForumCredentials;
        startButton.innerHTML = '<span class="btn-icon">🚀</span><span class="btn-text">Start Bot</span>';
      }
      if (stopButton) {
        stopButton.disabled = true;
      }
      if (runningIndicator) {
        runningIndicator.style.display = "none";
      }
    }
  }

  async function loadStats() {
    try {
      const result = await API.get("/api/stats");
      console.log("Stats API response:", result);
      if (result && result.success && result.data) {
        updateStatsDisplay(result.data);
      }
    } catch (error) {
      console.error("Error loading stats:", error);
    }
  }

  async function loadCredentialsStatus() {
    try {
      console.log("Loading credentials status...");
      const result = await API.get("/api/forum-credentials");
      console.log("Raw credentials API response:", result);
      
      // Check different possible response structures
      let credentialsData = null;
      
      if (result) {
        // Handle the nested data.data structure
        if (result.success && result.data && result.data.data) {
          console.log("Found nested credentials in result.data.data:", result.data.data);
          credentialsData = result.data.data;
        } else if (result.success && result.data) {
          console.log("Found credentials in result.data:", result.data);
          credentialsData = result.data;
        } else if (result.data) {
          console.log("Found credentials in result.data (no success flag):", result.data);
          credentialsData = result.data;
        } else if (result.hasCredentials !== undefined) {
          console.log("Found credentials directly in result:", result);
          credentialsData = result;
        } else {
          console.log("Unexpected response structure, treating as no credentials");
          credentialsData = { hasCredentials: false };
        }
      } else {
        console.log("No result from API, treating as no credentials");
        credentialsData = { hasCredentials: false };
      }
      
      updateCredentialsDisplay(credentialsData);
    } catch (error) {
      console.error("Error loading credentials status:", error);
      // On error, show form
      updateCredentialsDisplay({ hasCredentials: false });
    }
  }

  function updateCredentialsDisplay(data) {
    console.log("updateCredentialsDisplay called with:", data);
    console.log("Type of data:", typeof data);
    console.log("data.hasCredentials:", data.hasCredentials);
    console.log("Type of data.hasCredentials:", typeof data.hasCredentials);
    
    // Be very explicit about the check
    hasForumCredentials = (data.hasCredentials === true) || (data.hasCredentials === "true");
    console.log("hasForumCredentials set to:", hasForumCredentials);

    const credentialsCard = document.getElementById("credentialsCard");
    const credentialsForm = document.getElementById("credentialsForm");
    const startButton = document.getElementById("startButton");

    if (hasForumCredentials) {
      console.log("User HAS forum credentials - showing card");
      
      // Show logged in state
      if (credentialsCard) {
        credentialsCard.style.display = "block";
        console.log("Credentials card shown");
      }
      if (credentialsForm) {
        credentialsForm.style.display = "none";
        console.log("Credentials form hidden");
      }

      // Update credentials info
      if (data.username) {
        forumUsername = data.username;
        const usernameElement = document.getElementById("forumUsernameDisplay");
        if (usernameElement) {
          usernameElement.textContent = forumUsername;
          console.log("Username displayed:", forumUsername);
        }
      } else {
        // If no username provided, show "Set"
        const usernameElement = document.getElementById("forumUsernameDisplay");
        if (usernameElement) {
          usernameElement.textContent = "Credentials Set";
          console.log("Username displayed as 'Credentials Set'");
        }
      }

      if (data.lastUpdated) {
        const lastUpdatedElement = document.getElementById("credentialsLastUpdated");
        if (lastUpdatedElement) {
          lastUpdatedElement.textContent = formatTimeAgo(data.lastUpdated);
          console.log("Last updated displayed");
        }
      }

      // Enable start button only if bot is not running
      if (startButton) {
        const shouldDisable = isBotRunning;
        startButton.disabled = shouldDisable;
        console.log("Start button disabled:", shouldDisable, "(bot running:", isBotRunning, ")");
      }
    } else {
      console.log("User DOES NOT have forum credentials - showing form");
      
      // Show credentials form with a button instead of inline form
      if (credentialsCard) {
        credentialsCard.style.display = "none";
        console.log("Credentials card hidden");
      }
      
      // Create a better first-time setup experience
      if (credentialsForm) {
        credentialsForm.innerHTML = `
          <h3>Forum Credentials Required</h3>
          <p class="form-description">
            You need to set your forum credentials before you can start the bot.
          </p>
          <button class="btn btn-primary" onclick="document.getElementById('editCredentialsBtn').click()">
            Set Forum Credentials
          </button>
        `;
        credentialsForm.style.display = "block";
        console.log("Credentials setup prompt shown");
      }

      // Disable start button
      if (startButton) {
        startButton.disabled = true;
        console.log("Start button disabled (no credentials)");
      }
    }
  }

  function updateStatsDisplay(stats) {
    const formattedStats = Stats.formatStatsDisplay(stats);

    // Update stat cards
    const totalRunsEl = document.getElementById("totalRuns");
    const totalPostsEl = document.getElementById("totalPosts");
    const totalCommentsEl = document.getElementById("totalComments");
    const lastRunEl = document.getElementById("lastRun");

    if (totalRunsEl) totalRunsEl.textContent = formattedStats.totalRuns;
    if (totalPostsEl) totalPostsEl.textContent = formattedStats.totalPostsUpdated;
    if (totalCommentsEl) totalCommentsEl.textContent = formattedStats.totalCommentsAdded;
    if (lastRunEl) lastRunEl.textContent = formattedStats.lastRun;

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
      console.log("Saving credentials for:", username);
      const result = await API.post("/api/forum-credentials", {
        forumUsername: username,
        forumPassword: password,
      });

      console.log("Save credentials API response:", result);

      if (result && result.success) {
        Toast.success(
          "Credentials Saved",
          "Your forum credentials have been updated",
        );
        
        // Clear password field
        document.getElementById("forumPassword").value = "";
        
        // Wait a moment for the server to save
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Reload credentials status
        console.log("Reloading credentials after save...");
        await loadCredentialsStatus();
      } else {
        console.error("Save failed:", result);
        Toast.error(
          "Save Failed",
          result.error || result.data?.error || "Failed to save credentials",
        );
      }
    } catch (error) {
      console.error("Save credentials error:", error);
      Toast.error("Error", "Failed to save credentials");
    } finally {
      UI.showLoading(false);
    }
  }

  async function handleStartBot() {
    console.log("Start bot clicked. hasForumCredentials:", hasForumCredentials);
    
    if (!hasForumCredentials) {
      Toast.warning("Credentials Required", "Please set your forum credentials first");
      return;
    }
    
    Modal.confirm(
      "Start Bot?",
      "The bot will begin updating your forum posts and adding comments. This may take a few minutes.",
      async () => {
        UI.showLoading(true);

        try {
          const result = await API.post("/api/start-bot", {});
          console.log("Start bot API response:", result);

          if (!result.success) {
            // Check if it's a credentials issue
            if (result.message && result.message.includes("credentials")) {
              Toast.error(
                "Credentials Required",
                "Please set your forum credentials first",
              );
              // Reload credentials status to update UI
              loadCredentialsStatus();
            } else {
              Toast.error(
                "Start Failed",
                result.message || result.error || "Failed to start bot",
              );
            }
          } else {
            Toast.success("Bot Starting", "Your bot is starting up...");
          }
        } catch (error) {
          console.error("Start bot error:", error);
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
              result.message || result.error || "Failed to stop bot",
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
  
  // Add to global scope for debugging
  window.debugCredentials = {
    hasForumCredentials: () => hasForumCredentials,
    forumUsername: () => forumUsername,
    isBotRunning: () => isBotRunning,
    reloadCredentials: loadCredentialsStatus,
    checkStartButton: () => {
      const btn = document.getElementById("startButton");
      console.log("Start button state:", {
        disabled: btn.disabled,
        hasCredentials: hasForumCredentials,
        isBotRunning: isBotRunning
      });
    }
  };
})();