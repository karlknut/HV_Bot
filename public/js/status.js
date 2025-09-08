// Enhanced Status Page with Run History Details
(function () {
  "use strict";

  let logsVisible = false;
  let hasForumCredentials = false;
  let forumUsername = null;
  let runHistoryData = [];

  function init() {
    console.log("Status page initializing...");

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
    refreshStats();
    loadCredentialsStatus();

    // Setup event listeners
    setupEventListeners();

    // Auto-refresh stats every 30 seconds
    setInterval(refreshStats, 30000);
  }

  function setupUserDisplay(user) {
    // Update header user info
    const userNameElement = document.getElementById("userName");
    const userAvatar = document.getElementById("userAvatar");

    if (userNameElement) {
      userNameElement.textContent = user.username;
    }

    if (userAvatar) {
      userAvatar.textContent = user.username.substring(0, 2).toUpperCase();
    }
  }

  function setupEventListeners() {
    // Logout button
    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", handleLogout);
    }

    // Change credentials button
    const changeCredsBtn = document.getElementById("changeCredentialsBtn");
    if (changeCredsBtn) {
      changeCredsBtn.addEventListener("click", showChangeCredentialsModal);
    }
  }

  // Track processed message IDs to prevent duplicates
  const processedMessages = new Set();
  
  function handleWebSocketMessage(message) {
    // Create a unique ID for this message
    const messageId = `${message.type}_${message.timestamp || Date.now()}_${JSON.stringify(message.data).substring(0, 50)}`;
    
    // Skip if we've already processed this message
    if (processedMessages.has(messageId)) {
      return;
    }
    
    // Add to processed set and clean up old messages
    processedMessages.add(messageId);
    if (processedMessages.size > 100) {
      const oldestMessages = Array.from(processedMessages).slice(0, 50);
      oldestMessages.forEach(id => processedMessages.delete(id));
    }
    
    console.log("WebSocket message:", message);

    switch (message.type) {
      case "botStarted":
        updateBotStatus(true);
        addLogEntry(
          "Bot started: " + new Date(message.data.timestamp).toLocaleString(),
          "info",
        );
        document.getElementById("emergencyStop").disabled = false;
        Toast.info("Bot Started", "Your bot is now running");
        break;

      case "botCompleted":
        updateBotStatus(false);
        addLogEntry(
          `Bot completed: ${message.data.postsUpdated} posts updated, ${message.data.commentsAdded} comments added`,
          "info",
        );
        document.getElementById("emergencyStop").disabled = true;
        refreshStats();
        Toast.success(
          "Bot Completed",
          `Updated ${message.data.postsUpdated} posts, added ${message.data.commentsAdded} comments`,
        );
        break;

      case "botStopped":
        updateBotStatus(false);
        addLogEntry("Bot stopped by user", "info");
        document.getElementById("emergencyStop").disabled = true;
        refreshStats();
        Toast.info("Bot Stopped", "Bot has been stopped");
        break;

      case "botOutput":
        addLogEntry(message.data, "output");
        break;

      case "botError":
        updateBotStatus(false);
        addLogEntry("Bot error: " + message.data.error, "error");
        document.getElementById("emergencyStop").disabled = true;
        refreshStats();
        Toast.error("Bot Error", message.data.error || "An error occurred");
        break;

      case "statusUpdate":
        updateBotStatus(message.data.isRunning);
        if (message.data.isRunning) {
          document.getElementById("emergencyStop").disabled = false;
        }
        break;
    }
  }

  function updateBotStatus(isRunning) {
    const statusElement = document.getElementById("botStatus");

    if (isRunning) {
      statusElement.textContent = "Running";
      statusElement.className = "status-indicator status-running";
      document.getElementById("emergencyStop").disabled = false;
    } else {
      statusElement.textContent = "Idle";
      statusElement.className = "status-indicator status-idle";
      document.getElementById("emergencyStop").disabled = true;
    }
  }

  function addLogEntry(message, type = "output") {
    if (!logsVisible) return;

    const logContainer = document.getElementById("logContainer");
    const logEntry = document.createElement("div");
    logEntry.className = `log-entry ${type}`;
    logEntry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;

    logContainer.appendChild(logEntry);

    // Keep only last 100 log entries
    while (logContainer.children.length > 100) {
      logContainer.removeChild(logContainer.firstChild);
    }

    // Auto scroll to bottom
    logContainer.scrollTop = logContainer.scrollHeight;
  }

  async function refreshStats() {
    try {
      const response = await API.get("/api/stats");
      console.log("Stats API response:", response);
      
      if (response && response.success) {
        // Handle nested data structure
        let statsData = response.data?.data || response.data;
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
      const result = await API.get("/api/forum-credentials");
      console.log("Credentials API response:", result);
      
      if (result && result.success) {
        // Handle nested data structure
        let credentialsData = result.data?.data || result.data;
        if (credentialsData) {
          updateCredentialsDisplay(credentialsData);
        }
      } else {
        updateCredentialsDisplay({ hasCredentials: false });
      }
    } catch (error) {
      console.error("Error loading credentials status:", error);
      updateCredentialsDisplay({ hasCredentials: false });
    }
  }

  function updateCredentialsDisplay(data) {
    hasForumCredentials = data.hasCredentials === true;

    const connectionStatus = document.getElementById("connectionStatus");
    const forumUserDisplay = document.getElementById("forumUserDisplay");

    if (hasForumCredentials) {
      if (connectionStatus) {
        connectionStatus.className = "status-connected";
        connectionStatus.innerHTML =
          '<span class="status-dot"></span><span>Connected to Forum</span>';
      }

      // Display actual username if available
      if (data.username && data.username !== "") {
        forumUsername = data.username;
        if (forumUserDisplay) {
          forumUserDisplay.textContent = forumUsername;
        }
      } else {
        if (forumUserDisplay) {
          forumUserDisplay.textContent = "Credentials Set";
        }
      }
    } else {
      if (connectionStatus) {
        connectionStatus.className = "status-disconnected";
        connectionStatus.innerHTML =
          '<span class="status-dot" style="background: #ef4444;"></span><span>Not Connected</span>';
      }

      if (forumUserDisplay) {
        forumUserDisplay.textContent = "Not set";
      }
    }
  }

  function updateStatsDisplay(stats) {
    console.log("Updating stats display with:", stats);
    
    // Update individual stat values
    document.getElementById("totalRuns").textContent = stats.totalRuns || 0;
    document.getElementById("postsUpdated").textContent = stats.totalPostsUpdated || 0;
    document.getElementById("commentsAdded").textContent = stats.totalCommentsAdded || 0;

    const lastRun = stats.lastRunDate
      ? formatTimeAgo(stats.lastRunDate)
      : "Never";
    document.getElementById("lastRun").textContent = lastRun;
    document.getElementById("lastRunStatus").textContent = formatStatus(
      stats.lastRunStatus || "unknown",
    );

    // Calculate success rate
    const totalRuns = stats.totalRuns || 0;
    const successfulRuns = stats.runHistory
      ? stats.runHistory.filter((run) => run.status === "completed").length
      : 0;
    const successRate =
      totalRuns > 0 ? Math.round((successfulRuns / totalRuns) * 100) : 0;
    document.getElementById("successRate").textContent = `${successRate}%`;

    // Update bot status
    updateBotStatus(stats.isRunning || false);

    // Store run history data
    runHistoryData = stats.runHistory || [];

    // Update run history
    updateRunHistory(stats.runHistory || []);
  }

  function updateRunHistory(history) {
    const tbody = document.getElementById("historyTableBody");
    tbody.innerHTML = "";

    if (history.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="5" style="text-align: center; color: #666;">No runs yet</td></tr>';
      return;
    }

    history.slice(0, 20).forEach((run, index) => {
      const row = tbody.insertRow();
      const date = new Date(run.date).toLocaleString();

      // Make the row clickable
      row.style.cursor = "pointer";
      row.style.transition = "background 0.3s";
      
      row.innerHTML = `
        <td>${date}</td>
        <td><span class="status-indicator ${getStatusClass(run.status)}">${run.status}</span></td>
        <td>${run.postsUpdated || 0}</td>
        <td>${run.commentsAdded || 0}</td>
        <td>${run.duration || '-'}</td>
      `;

      // Add click handler to show run details
      row.addEventListener("click", () => showRunDetails(run));
      
      // Add hover effect
      row.addEventListener("mouseenter", () => {
        row.style.background = "rgba(255, 255, 255, 0.05)";
      });
      
      row.addEventListener("mouseleave", () => {
        row.style.background = "";
      });
    });
  }

  function showRunDetails(run) {
    // Use actual thread titles from the run data
    const threadTitles = run.threadTitles || [];
    
    const modalContent = `
      <div style="text-align: left;">
        <div style="margin-bottom: 1rem;">
          <strong style="color: #3b82f6;">Date:</strong> 
          <span style="color: #ccc;">${new Date(run.date).toLocaleString()}</span>
        </div>
        <div style="margin-bottom: 1rem;">
          <strong style="color: #3b82f6;">Status:</strong> 
          <span class="status-indicator ${getStatusClass(run.status)}">${run.status}</span>
        </div>
        <div style="margin-bottom: 1rem;">
          <strong style="color: #3b82f6;">Posts Updated:</strong> 
          <span style="color: #ccc;">${run.postsUpdated || 0}</span>
        </div>
        <div style="margin-bottom: 1rem;">
          <strong style="color: #3b82f6;">Comments Added:</strong> 
          <span style="color: #ccc;">${run.commentsAdded || 0}</span>
        </div>
        ${run.error ? `
          <div style="margin-bottom: 1rem;">
            <strong style="color: #ef4444;">Error:</strong> 
            <span style="color: #ccc;">${run.error}</span>
          </div>
        ` : ''}
        ${threadTitles.length > 0 ? `
          <div style="margin-top: 1.5rem;">
            <strong style="color: #3b82f6; display: block; margin-bottom: 0.75rem;">
              Forum Threads Processed:
            </strong>
            <div style="max-height: 300px; overflow-y: auto; background: rgba(0,0,0,0.3); 
                        border-radius: 8px; padding: 0.75rem;">
              ${threadTitles.map((title, i) => `
                <div style="padding: 0.5rem; border-bottom: 1px solid rgba(255,255,255,0.05); 
                            color: #ccc;">
                  <span style="color: #666;">${i + 1}.</span> ${title}
                </div>
              `).join('')}
            </div>
          </div>
        ` : threadTitles.length === 0 && run.status === 'completed' ? `
          <div style="margin-top: 1.5rem; color: #666; font-style: italic;">
            No thread titles recorded for this run.
          </div>
        ` : ''}
      </div>
    `;

    Modal.show({
      type: 'info',
      title: 'Bot Run Details',
      message: '', // Will be replaced by custom content
      confirmText: 'Close',
      confirmClass: 'modal-btn-primary',
      onConfirm: () => {}
    });

    // Replace the modal body with custom content
    setTimeout(() => {
      document.getElementById('modalBody').innerHTML = modalContent;
      // Hide the cancel button for this info modal
      document.getElementById('modalCancel').style.display = 'none';
    }, 10);
  }

  function getStatusClass(status) {
    switch (status) {
      case "completed":
        return "status-idle";
      case "running":
        return "status-running";
      case "error":
        return "status-error";
      default:
        return "status-idle";
    }
  }

  function formatStatus(status) {
    const statusMap = {
      completed: "Successfully completed",
      running: "Currently running",
      error: "Failed with error",
      stopped: "Manually stopped",
      never_run: "Never run",
      unknown: "Unknown status",
    };
    return statusMap[status] || status;
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

  function showChangeCredentialsModal() {
    // Create custom modal content with form
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
        const username = document
          .getElementById("modalForumUsername")
          .value.trim();
        const password = document.getElementById("modalForumPassword").value;

        if (!username || !password) {
          Toast.warning(
            "Missing Information",
            "Please enter both username and password",
          );
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
        Toast.success(
          "Credentials Updated",
          "Your forum credentials have been saved",
        );
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

  // Global functions for onclick handlers
  window.toggleLogs = function () {
    logsVisible = !logsVisible;
    const logSection = document.getElementById("logSection");

    if (logsVisible) {
      logSection.classList.add("show");
      addLogEntry("Live logs enabled", "info");
      Toast.info("Logs Enabled", "Live output will be displayed");
    } else {
      logSection.classList.remove("show");
      Toast.info("Logs Disabled", "Live output hidden");
    }
  };

  window.refreshStats = async function () {
    // Show refreshing message first
    Toast.info("Refreshing", "Updating statistics...", 1500);
    
    // Wait a bit before actually refreshing
    setTimeout(async () => {
      await refreshStats();
      
      // Show updated indicator after a delay
      setTimeout(() => {
        const indicator = document.createElement('div');
        indicator.className = 'refresh-indicator show';
        indicator.textContent = '✓ Updated';
        indicator.style.cssText = 'position: fixed; top: 80px; left: 50%; transform: translateX(-50%); background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 0.5rem 1rem; border-radius: 20px; font-weight: 600; font-size: 0.9rem; box-shadow: 0 4px 15px rgba(16, 185, 129, 0.3); z-index: 1000; transition: opacity 0.3s ease;';
        document.body.appendChild(indicator);
        
        setTimeout(() => {
          indicator.style.opacity = '0';
          setTimeout(() => {
            if (indicator.parentNode) {
              indicator.parentNode.removeChild(indicator);
            }
          }, 300);
        }, 2000);
      }, 500);
    }, 100);
  };

  window.emergencyStop = async function () {
    Modal.danger(
      "Emergency Stop",
      "Are you sure you want to force stop the bot? This may interrupt ongoing operations.",
      async () => {
        try {
          const response = await API.post("/api/stop-bot", {});

          if (response && response.success) {
            Toast.success(
              "Bot Stopped",
              "Emergency stop initiated successfully",
            );
            addLogEntry("Emergency stop initiated", "info");
          } else {
            Toast.error("Stop Failed", response.error || "Failed to stop bot");
          }
        } catch (error) {
          Toast.error("Error", "Failed to stop bot: " + error.message);
        }
      },
    );
  };

  // Initialize when DOM is loaded
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();