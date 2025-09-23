// public/js/status-enhanced.js - Fixed with proper run history and stats
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
    loadAllData();
    setupEventListeners();

    // Auto-refresh every 30 seconds
    setInterval(() => {
      loadAllData();
    }, 30000);
  }

  function loadAllData() {
    console.log("Loading all status data...");
    refreshStats();
    loadCredentialsStatus();
    loadGPUStats();
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
      console.log("Loading stats from API...");

      const response = await fetch("/api/stats", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${Auth.getToken()}`,
          "Content-Type": "application/json",
        },
      });

      const result = await response.json();
      console.log("Stats API response:", result);

      if (result && result.success && result.data) {
        // Store run history for modal
        runHistoryData = result.data.runHistory || [];
        updateStatsDisplay(result.data);
      } else {
        console.error("Stats API call failed:", result);
        setDefaultStats();
      }
    } catch (error) {
      console.error("Error loading stats:", error);
      setDefaultStats();
    }
  }

  function setDefaultStats() {
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
      const listingsResponse = await fetch("/api/gpu/listings?limit=1000", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${Auth.getToken()}`,
          "Content-Type": "application/json",
        },
      });

      const listingsResult = await listingsResponse.json();
      let totalListings = 0;

      if (listingsResult && listingsResult.success && listingsResult.data) {
        totalListings = Array.isArray(listingsResult.data)
          ? listingsResult.data.length
          : 0;
      }

      const statsResponse = await fetch("/api/gpu/stats", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${Auth.getToken()}`,
          "Content-Type": "application/json",
        },
      });

      const statsResult = await statsResponse.json();
      let uniqueModels = 0;
      let lastScanDate = null;

      if (statsResult && statsResult.success && statsResult.data) {
        const stats = Array.isArray(statsResult.data) ? statsResult.data : [];
        uniqueModels = stats.length;

        if (listingsResult.data && listingsResult.data.length > 0) {
          const sortedByDate = listingsResult.data.sort(
            (a, b) => new Date(b.scraped_at) - new Date(a.scraped_at),
          );
          if (sortedByDate[0].scraped_at) {
            lastScanDate = new Date(sortedByDate[0].scraped_at);
          }
        }
      }

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
        const gpuScans = runHistoryData.filter(
          (run) => run.botType === "gpu" || run.gpusFound !== undefined,
        ).length;
        totalScansElement.textContent = gpuScans.toString();
      }

      if (lastScanElement) {
        if (lastScanDate) {
          lastScanElement.textContent = formatTimeAgo(lastScanDate);
        } else {
          lastScanElement.textContent =
            totalListings > 0 ? "Recently" : "Never";
        }
      }
    } catch (error) {
      console.error("Error loading GPU stats:", error);

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
      const response = await fetch("/api/forum-credentials", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${Auth.getToken()}`,
          "Content-Type": "application/json",
        },
      });

      const result = await response.json();

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
    const credentialsCard = document.getElementById("credentialsStatusCard");

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

    if (credentialsCard) {
      if (hasForumCredentials) {
        credentialsCard.style.borderColor = "rgba(16, 185, 129, 0.3)";
        credentialsCard.style.background =
          "linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(5, 150, 105, 0.05) 100%)";
      } else {
        credentialsCard.style.borderColor = "rgba(239, 68, 68, 0.3)";
        credentialsCard.style.background =
          "linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, rgba(220, 38, 38, 0.05) 100%)";
      }
    }
  }

  function updateStatsDisplay(stats) {
    console.log("Updating stats display with:", stats);

    // Update basic stats
    const updates = {
      totalRuns: stats.totalRuns || 0,
      postsUpdated: stats.totalPostsUpdated || 0,
      commentsAdded: stats.totalCommentsAdded || 0,
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
      if (stats.lastRunDate) {
        const date = new Date(stats.lastRunDate);
        if (!isNaN(date.getTime())) {
          lastRunElement.textContent = formatTimeAgo(date);
        } else {
          lastRunElement.textContent = "Never";
        }
      } else {
        lastRunElement.textContent = "Never";
      }
    }

    // Update last run status (fix the "currently running" issue)
    const lastRunStatusElement = document.getElementById("lastRunStatus");
    if (lastRunStatusElement) {
      // Only show "running" if bot is ACTUALLY running
      const actualStatus = stats.isRunning
        ? "running"
        : stats.lastRunStatus || "unknown";
      lastRunStatusElement.textContent = formatStatus(actualStatus);

      if (actualStatus === "completed") {
        lastRunStatusElement.style.color = "#10b981";
      } else if (actualStatus === "error") {
        lastRunStatusElement.style.color = "#ef4444";
      } else if (actualStatus === "running") {
        lastRunStatusElement.style.color = "#f59e0b";
      } else {
        lastRunStatusElement.style.color = "rgba(255, 255, 255, 0.6)";
      }
    }

    // Calculate success rate from run history
    const successRateElement = document.getElementById("successRate");
    if (successRateElement) {
      const runHistory = stats.runHistory || [];
      const totalRuns = runHistory.length;

      if (totalRuns > 0) {
        const successfulRuns = runHistory.filter(
          (run) => run.status === "completed",
        ).length;
        const successRate = Math.round((successfulRuns / totalRuns) * 100);
        successRateElement.textContent = `${successRate}%`;
      } else {
        successRateElement.textContent = "0%";
      }
    }

    // Update bot status
    updateBotStatus(stats.isRunning === true);

    // Update run history
    updateRunHistory(stats.runHistory || []);
  }

  function updateRunHistory(history) {
    const tbody = document.getElementById("historyTableBody");
    if (!tbody) return;

    if (!history || history.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="6" style="text-align: center; color: #666;">No runs yet</td></tr>';
      return;
    }

    tbody.innerHTML = history
      .slice(0, 20)
      .map((run) => {
        const date = new Date(run.date || run.run_date);
        const displayDate = !isNaN(date.getTime())
          ? date.toLocaleString()
          : "Unknown";

        const isGPUScan = run.gpusFound !== undefined || run.botType === "gpu";
        const botType = isGPUScan ? "GPU Scanner" : "Forum Bot";
        const botTypeClass = isGPUScan ? "bot-type-gpu" : "bot-type-forum";

        const postsOrGPUs = isGPUScan
          ? run.gpusFound || 0
          : run.postsUpdated || 0;
        const commentsOrNew = isGPUScan
          ? run.newGPUs || 0
          : run.commentsAdded || 0;
        const duration = run.duration;

        // Create row with clickable handler
        return `
        <tr style="cursor: pointer;" onclick="window.showRunDetails('${escapeHtml(
          run.date || "",
        )}', '${escapeHtml(botType)}', '${run.status || "unknown"}')">
          <td>${displayDate}</td>
          <td><span class="bot-type-indicator ${botTypeClass}">${botType}</span></td>
          <td><span class="status-indicator ${getStatusClass(
            run.status,
          )}">${run.status || "unknown"}</span></td>
          <td>${postsOrGPUs}</td>
          <td>${commentsOrNew}</td>
          <td>${formatDuration(duration) || "-"}</td>
        </tr>
      `;
      })
      .join("");
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
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
    const dateObj = typeof date === "string" ? new Date(date) : date;

    if (isNaN(dateObj.getTime())) {
      return "Unknown";
    }

    const seconds = Math.floor((new Date() - dateObj) / 1000);

    if (seconds < 0) {
      return "Future date";
    }

    if (seconds < 60) return "Just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return dateObj.toLocaleDateString();
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
          <input type="text" id="modalForumUsername" value="${
            forumUsername || ""
          }" 
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
      const response = await fetch("/api/forum-credentials", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${Auth.getToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          forumUsername: username,
          forumPassword: password,
        }),
      });

      const result = await response.json();

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
    await loadAllData();
    UI.showRefreshIndicator();
  };

  window.emergencyStop = async function () {
    Modal.danger(
      "Emergency Stop",
      "Are you sure you want to force stop the bot?",
      async () => {
        try {
          const response = await fetch("/api/stop-bot", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${Auth.getToken()}`,
              "Content-Type": "application/json",
            },
          });

          const result = await response.json();

          if (result && result.success) {
            Toast.success("Bot Stopped", "Emergency stop initiated");
            addLogEntry("Emergency stop initiated", "info");
          } else {
            Toast.error("Stop Failed", result.error || "Failed to stop bot");
          }
        } catch (error) {
          Toast.error("Error", "Failed to stop bot: " + error.message);
        }
      },
    );
  };

  window.showRunDetails = function (date, botType, status) {
    Toast.info(
      "Run Details",
      `${botType} run from ${date} - Status: ${status}`,
    );
  };

  // Initialize
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
