// Dashboard with all fixes applied
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

    // Auto-refresh stats every 30 seconds
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

    // Edit credentials button - now uses modal like status page
    const editCredsBtn = document.getElementById("editCredentialsBtn");
    if (editCredsBtn) {
      editCredsBtn.addEventListener("click", showChangeCredentialsModal);
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
      
      if (result && result.success) {
        // Handle nested data structure
        const statsData = result.data?.data || result.data;
        if (statsData) {
          updateStatsDisplay(statsData);
        }
      }
    } catch (error) {
      console.error("Error loading stats:", error);
    }
  }

  async function loadCredentialsStatus() {
    try {
      console.log("Loading credentials status...");
      const result = await API.get("/api/forum-credentials");
      console.log("Credentials API response:", result);
      
      if (result && result.success && result.data) {
        // Handle nested structure properly
        const credentialsData = result.data.data || result.data;
        updateCredentialsDisplay(credentialsData);
      } else {
        updateCredentialsDisplay({ hasCredentials: false });
      }
    } catch (error) {
      console.error("Error loading credentials status:", error);
      updateCredentialsDisplay({ hasCredentials: false });
    }
  }

  function updateCredentialsDisplay(data) {
    console.log("updateCredentialsDisplay called with:", data);
    
    hasForumCredentials = data.hasCredentials === true;
    console.log("hasForumCredentials set to:", hasForumCredentials);

    const credentialsCard = document.getElementById("credentialsCard");
    const credentialsForm = document.getElementById("credentialsForm");
    const startButton = document.getElementById("startButton");

    if (hasForumCredentials) {
      console.log("User HAS forum credentials");
      
      // Show logged in state
      if (credentialsCard) {
        credentialsCard.style.display = "block";
      }
      if (credentialsForm) {
        credentialsForm.style.display = "none";
      }

      // Update credentials info - FIXED to show actual username
      const usernameElement = document.getElementById("forumUsernameDisplay");
      if (usernameElement) {
        if (data.username && data.username !== "") {
          forumUsername = data.username;
          usernameElement.textContent = forumUsername;
          console.log("Forum username displayed:", forumUsername);
        } else {
          // Fallback only if username is truly not available
          usernameElement.textContent = "Credentials Set";
          console.log("No username available, showing fallback");
        }
      }

      if (data.lastUpdated) {
        const lastUpdatedElement = document.getElementById("credentialsLastUpdated");
        if (lastUpdatedElement) {
          lastUpdatedElement.textContent = formatTimeAgo(data.lastUpdated);
        }
      }

      // Enable start button only if bot is not running
      if (startButton) {
        startButton.disabled = isBotRunning;
      }
    } else {
      console.log("User DOES NOT have forum credentials");
      
      // Show credentials form with setup prompt
      if (credentialsCard) {
        credentialsCard.style.display = "none";
      }
      
      if (credentialsForm) {
        credentialsForm.innerHTML = `
          <h3>Forum Credentials Required</h3>
          <p class="form-description">
            You need to set your forum credentials before you can start the bot.
          </p>
          <button class="btn btn-primary" onclick="window.showChangeCredentialsModal()">
            Set Forum Credentials
          </button>
        `;
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

  function showChangeCredentialsModal() {
    // Create custom modal content with form (same as status page)
    const modalContent = `
      <div style="text-align: left;">
        <p style="color: #aaa; margin-bottom: 1.5rem;">
          Update your forum login credentials. They will be encrypted and stored securely.
        </p>
        <div class="form-group" style="margin-bottom: 1rem;">
          <label for="modalForumUsername" style="color: #ccc; display: block; margin-bottom: 0.5rem;">
            Forum Username
          </label>
          <input type="text" id="modalForumUsername" value="${forumUsername || ""}" 
                 style="width: 100%; padding: 0.7rem; background: rgba(0,0,0,0.3); 
                        border: 1px solid #444; border-radius: 8px; color: white;">
        </div>
        <div class="form-group">
          <label for="modalForumPassword" style="color: #ccc; display: block; margin-bottom: 0.5rem;">
            Forum Password
          </label>
          <input type="password" id="modalForumPassword" 
                 placeholder="Enter new password" 
                 style="width: 100%; padding: 0.7rem; background: rgba(0,0,0,0.3); 
                        border: 1px solid #444; border-radius: 8px; color: white;">
        </div>
      </div>
    `;

    // Show modal with custom content
    Modal.show({
      type: "confirm",
      title: "Update Forum Credentials",
      message: "", // Will be replaced by custom content
      confirmText: "Save",
      cancelText: "Cancel",
      confirmClass: "modal-btn-primary",
      onConfirm: async () => {
        const username = document.getElementById("modalForumUsername").value.trim();
        const password = document.getElementById("modalForumPassword").value;

        if (!username || !password) {
          Toast.warning("Missing Information", "Please enter both username and password");
          return;
        }

        await saveCredentials(username, password);
      },
    });

    // Replace the modal body with custom content
    setTimeout(() => {
      document.getElementById("modalBody").innerHTML = modalContent;
    }, 10);
  }

  async function saveCredentials(username, password) {
    UI.showLoading(true);

    try {
      const result = await API.post("/api/forum-credentials", {
        forumUsername: username,
        forumPassword: password,
      });

      if (result && result.success) {
        Toast.success("Credentials Saved", "Your forum credentials have been updated");
        
        // Reload credentials status to update display
        await loadCredentialsStatus();
      } else {
        Toast.error("Save Failed", result.error || "Failed to save credentials");
      }
    } catch (error) {
      console.error("Save credentials error:", error);
      Toast.error("Error", "Failed to save credentials");
    } finally {
      UI.showLoading(false);
    }
  }

  async function handleSaveCredentials() {
    const username = document.getElementById("forumUsername").value.trim();
    const password = document.getElementById("forumPassword").value;

    if (!username || !password) {
      Toast.warning("Missing Information", "Please enter both username and password");
      return;
    }

    await saveCredentials(username, password);
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
            if (result.message && result.message.includes("credentials")) {
              Toast.error("Credentials Required", "Please set your forum credentials first");
              loadCredentialsStatus();
            } else {
              Toast.error("Start Failed", result.message || result.error || "Failed to start bot");
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
            Toast.error("Stop Failed", result.message || result.error || "Failed to stop bot");
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

  // Make showChangeCredentialsModal available globally for onclick handler
  window.showChangeCredentialsModal = showChangeCredentialsModal;

  // Initialize when DOM is loaded
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();