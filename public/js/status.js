// Fixed version with proper data extraction
(function () {
  "use strict";

  let logsVisible = false;
  let hasForumCredentials = false;
  let forumUsername = null;
  let runHistoryData = [];

  function init() {
    console.log("Status page initializing...");

    if (!Auth.isAuthenticated()) {
      window.location.href = "/";
      return;
    }

    const user = Auth.getUser();
    if (!user || !user.username) {
      Auth.logout();
      return;
    }

    setupUserDisplay(user);
    WS.init(handleWebSocketMessage);

    // Load data immediately
    refreshStats();
    loadCredentialsStatus();
    loadGPUStats();

    setupEventListeners();

    // Auto-refresh every 30 seconds
    setInterval(() => {
      refreshStats();
      loadGPUStats();
    }, 30000);
  }

  function setupUserDisplay(user) {
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
    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", handleLogout);
    }

    const changeCredsBtn = document.getElementById("changeCredentialsBtn");
    if (changeCredsBtn) {
      changeCredsBtn.addEventListener("click", showChangeCredentialsModal);
    }
  }

  function handleWebSocketMessage(message) {
    console.log("WebSocket message:", message);

    switch (message.type) {
      case "botStarted":
        updateBotStatus(true);
        addLogEntry(
          "Forum Bot started: " + new Date().toLocaleString(),
          "info",
        );
        document.getElementById("emergencyStop").disabled = false;
        Toast.info("Bot Started", "Forum bot is now running");
        break;

      case "gpuScanStarted":
        addLogEntry("GPU Scan started: " + new Date().toLocaleString(), "info");
        Toast.info("GPU Scan Started", "Scanning forum for GPU listings");
        break;

      case "gpuScanUpdate":
        addLogEntry("GPU Scan: " + message.data, "output");
        break;

      case "gpuScanCompleted":
        addLogEntry(
          `GPU Scan completed: Found ${message.data.totalFound || 0} listings`,
          "info",
        );
        setTimeout(() => {
          loadGPUStats();
          refreshStats();
        }, 1000);
        Toast.success(
          "GPU Scan Complete",
          `Found ${message.data.totalFound || 0} listings`,
        );
        break;

      case "botCompleted":
        updateBotStatus(false);
        addLogEntry(
          `Forum Bot completed: ${message.data.postsUpdated} posts, ${message.data.commentsAdded} comments`,
          "info",
        );
        document.getElementById("emergencyStop").disabled = true;
        setTimeout(() => {
          refreshStats();
        }, 1000);
        Toast.success(
          "Bot Completed",
          `Updated ${message.data.postsUpdated} posts`,
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
        break;
    }
  }

  function updateBotStatus(isRunning) {
    const statusElement = document.getElementById("botStatus");

    if (statusElement) {
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
  }

  function addLogEntry(message, type = "output") {
    if (!logsVisible) return;

    const logContainer = document.getElementById("logContainer");
    if (!logContainer) return;

    const logEntry = document.createElement("div");
    logEntry.className = `log-entry ${type}`;
    logEntry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;

    logContainer.appendChild(logEntry);

    while (logContainer.children.length > 100) {
      logContainer.removeChild(logContainer.firstChild);
    }

    logContainer.scrollTop = logContainer.scrollHeight;
  }

  async function refreshStats() {
    try {
      console.log("Loading stats...");

      const response = await API.get("/api/stats");
      console.log("Raw stats response:", response);

      if (response && response.success) {
        // Handle different response structures
        let statsData = response.data;

        // If data is nested, extract it
        if (statsData && statsData.data) {
          statsData = statsData.data;
        }

        console.log("Extracted stats data:", statsData);

        if (statsData) {
          updateStatsDisplay(statsData);
        } else {
          console.error("No stats data found in response");
          setDefaultStats();
        }
      } else {
        console.error("Stats API call failed:", response);
        setDefaultStats();
      }
    } catch (error) {
      console.error("Error loading stats:", error);
      setDefaultStats();
    }
  }

  function setDefaultStats() {
    console.log("Setting default stats");
    updateStatsDisplay({
      totalRuns: 0,
      totalPostsUpdated: 0,
      totalCommentsAdded: 0,
      lastRunDate: null,
      lastRunStatus: "never_run",
      runHistory: [],
      isRunning: false,
    });
  }

  async function loadGPUStats() {
    try {
      console.log("Loading GPU stats...");

      // Get total listings first
      const listingsResponse = await API.get("/api/gpu/listings?limit=1");
      console.log("Listings response for count:", listingsResponse);

      let totalListings = 0;
      if (listingsResponse && listingsResponse.success) {
        totalListings = listingsResponse.total || 0;

        // If total not provided, try to get from data length
        if (
          totalListings === 0 &&
          listingsResponse.data &&
          Array.isArray(listingsResponse.data)
        ) {
          // Get actual count with a larger limit
          const fullResponse = await API.get("/api/gpu/listings?limit=1000");
          if (fullResponse && fullResponse.success && fullResponse.data) {
            totalListings = fullResponse.data.length;
          }
        }
      }

      console.log("Total GPU listings:", totalListings);

      // Get model stats
      const statsResponse = await API.get("/api/gpu/stats");
      console.log("GPU stats response:", statsResponse);

      let uniqueModels = 0;
      let lastScanDate = null;

      if (statsResponse && statsResponse.success && statsResponse.data) {
        const stats = statsResponse.data;
        uniqueModels = Array.isArray(stats) ? stats.length : 0;

        // Find latest date from stats
        if (Array.isArray(stats) && stats.length > 0) {
          const latestDates = stats
            .map((s) => s.latestDate)
            .filter((d) => d)
            .map((d) => new Date(d))
            .sort((a, b) => b - a);

          if (latestDates.length > 0) {
            lastScanDate = latestDates[0];
          }
        }
      }

      // If no date from stats, try to get from recent listings
      if (!lastScanDate && totalListings > 0) {
        try {
          const recentResponse = await API.get(
            "/api/gpu/listings?limit=1&sortBy=scraped_at&sortOrder=desc",
          );
          if (
            recentResponse &&
            recentResponse.success &&
            recentResponse.data &&
            recentResponse.data.length > 0
          ) {
            const mostRecent = recentResponse.data[0];
            if (mostRecent.scraped_at) {
              lastScanDate = new Date(mostRecent.scraped_at);
            }
          }
        } catch (error) {
          console.error("Error getting recent listings:", error);
        }
      }

      // Update display
      const totalGPUsElement = document.getElementById("totalGPUsFound");
      const uniqueModelsElement = document.getElementById("uniqueGPUModels");
      const totalScansElement = document.getElementById("totalGPUScans");
      const lastScanElement = document.getElementById("lastGPUScan");

      if (totalGPUsElement) {
        totalGPUsElement.textContent = totalListings.toString();
      }

      if (uniqueModelsElement) {
        uniqueModelsElement.textContent = uniqueModels.toString();
      }

      if (totalScansElement) {
        // Estimate scans based on listings (roughly 20-30 per scan)
        const estimatedScans = Math.max(1, Math.ceil(totalListings / 25));
        totalScansElement.textContent = estimatedScans.toString();
      }

      if (lastScanElement) {
        if (lastScanDate) {
          lastScanElement.textContent = formatTimeAgo(lastScanDate);
        } else {
          lastScanElement.textContent =
            totalListings > 0 ? "Recently" : "Never";
        }
      }

      console.log("GPU stats updated:", {
        totalListings,
        uniqueModels,
        lastScanDate,
      });
    } catch (error) {
      console.error("Error loading GPU stats:", error);

      // Set defaults on error
      const elements = ["totalGPUsFound", "uniqueGPUModels", "totalGPUScans"];
      elements.forEach((id) => {
        const element = document.getElementById(id);
        if (element) element.textContent = "0";
      });

      const lastScanElement = document.getElementById("lastGPUScan");
      if (lastScanElement) lastScanElement.textContent = "Never";
    }
  }

  async function loadCredentialsStatus() {
    try {
      console.log("Loading credentials status...");

      const result = await API.get("/api/forum-credentials");
      console.log("Credentials response:", result);

      if (result && result.success && result.data) {
        updateCredentialsDisplay(result.data);
      } else {
        updateCredentialsDisplay({ hasCredentials: false });
      }
    } catch (error) {
      console.error("Error loading credentials:", error);
      updateCredentialsDisplay({ hasCredentials: false });
    }
  }

  function updateCredentialsDisplay(data) {
    hasForumCredentials = data.hasCredentials === true;

    const connectionStatus = document.getElementById("connectionStatus");

    if (connectionStatus) {
      if (hasForumCredentials) {
        connectionStatus.className = "status-connected";
        connectionStatus.innerHTML =
          '<span class="status-dot"></span><span>Connected to Forum</span>';

        if (data.username) {
          forumUsername = data.username;
        }
      } else {
        connectionStatus.className = "status-disconnected";
        connectionStatus.innerHTML =
          '<span class="status-dot" style="background: #ef4444;"></span><span>Not Connected</span>';
      }
    }
  }

  function updateStatsDisplay(stats) {
    console.log("Updating stats display with:", stats);

    // Update basic stats with safe defaults
    const updates = {
      totalRuns: stats.totalRuns || stats.total_runs || 0,
      postsUpdated: stats.totalPostsUpdated || stats.total_posts_updated || 0,
      commentsAdded:
        stats.totalCommentsAdded || stats.total_comments_added || 0,
    };

    Object.entries(updates).forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (element) {
        element.textContent = value.toString();
      }
    });

    // Update last run
    const lastRunElement = document.getElementById("lastRun");
    if (lastRunElement) {
      const lastRunDate = stats.lastRunDate || stats.last_run_date;
      lastRunElement.textContent = lastRunDate
        ? formatTimeAgo(lastRunDate)
        : "Never";
    }

    // Update last run status
    const lastRunStatusElement = document.getElementById("lastRunStatus");
    if (lastRunStatusElement) {
      const status = stats.lastRunStatus || stats.last_run_status || "unknown";
      lastRunStatusElement.textContent = formatStatus(status);
    }

    // Calculate and update success rate
    const successRateElement = document.getElementById("successRate");
    if (successRateElement) {
      const totalRuns = updates.totalRuns;
      const runHistory = stats.runHistory || [];
      const successfulRuns = runHistory.filter(
        (run) => run.status === "completed",
      ).length;
      const successRate =
        totalRuns > 0 ? Math.round((successfulRuns / totalRuns) * 100) : 0;
      successRateElement.textContent = `${successRate}%`;
    }

    // Update bot status
    updateBotStatus(stats.isRunning || false);

    // Update run history
    const runHistory = stats.runHistory || [];
    updateRunHistory(runHistory);

    console.log("Stats display updated successfully");
  }

  function updateRunHistory(history) {
    const tbody = document.getElementById("historyTableBody");
    if (!tbody) {
      console.log("History table body not found");
      return;
    }

    if (!history || history.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="6" style="text-align: center; color: #666;">No runs yet</td></tr>';
      return;
    }

    console.log("Updating run history with", history.length, "entries");

    tbody.innerHTML = history
      .slice(0, 20)
      .map((run) => {
        const date = new Date(run.date || run.run_date).toLocaleString();

        // Determine bot type
        const isGPUScan =
          run.gpusFound !== undefined ||
          run.gpus_found !== undefined ||
          run.botType === "gpu" ||
          run.bot_type === "gpu";
        const botType = isGPUScan ? "GPU Scanner" : "Forum Bot";
        const botTypeClass = isGPUScan ? "bot-type-gpu" : "bot-type-forum";

        const postsOrGPUs = isGPUScan
          ? run.gpusFound || run.gpus_found || 0
          : run.postsUpdated || run.posts_updated || 0;
        const commentsOrNew = isGPUScan
          ? run.newGPUs || run.new_gpus || 0
          : run.commentsAdded || run.comments_added || 0;
        const duration = run.duration || run.duration_seconds;

        return `
        <tr style="cursor: pointer;" onclick="showRunDetails(${JSON.stringify(run).replace(/"/g, "&quot;")}, '${botType}')">
          <td>${date}</td>
          <td><span class="bot-type-indicator ${botTypeClass}">${botType}</span></td>
          <td><span class="status-indicator ${getStatusClass(run.status)}">${run.status}</span></td>
          <td>${postsOrGPUs}</td>
          <td>${commentsOrNew}</td>
          <td>${formatDuration(duration) || "-"}</td>
        </tr>
      `;
      })
      .join("");
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

  function formatDuration(seconds) {
    if (!seconds) return "-";

    if (seconds < 60) {
      return `${seconds}s`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${minutes}m ${secs}s`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return `${hours}h ${minutes}m`;
    }
  }

  function showChangeCredentialsModal() {
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

    Modal.show({
      type: "confirm",
      title: "Update Forum Credentials",
      message: "",
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

  // Global functions
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
    Toast.info("Refreshing", "Updating statistics...", 1500);
    await refreshStats();
    await loadGPUStats();
    UI.showRefreshIndicator();
  };

  window.emergencyStop = async function () {
    Modal.danger(
      "Emergency Stop",
      "Are you sure you want to force stop the bot?",
      async () => {
        try {
          const response = await API.post("/api/stop-bot", {});
          if (response && response.success) {
            Toast.success("Bot Stopped", "Emergency stop initiated");
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

  window.showRunDetails = function (run, botType) {
    console.log("Showing run details:", run, botType);
    // Implementation for showing run details modal
    Toast.info(
      "Run Details",
      `${botType} run from ${new Date(run.date || run.run_date).toLocaleString()}`,
    );
  };

  // Initialize
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
