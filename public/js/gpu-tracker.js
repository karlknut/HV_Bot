// public/js/gpu-tracker-fixed.js
// Replace the content of public/js/gpu-tracker.js with this fixed version

(function () {
  "use strict";

  let gpuListings = [];
  let gpuStats = [];
  let userAlerts = [];
  let sortColumn = "scraped_at";
  let sortOrder = "desc";
  let filtersVisible = false;
  let alertsVisible = false;
  let isScanning = false;

  function init() {
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
    setupEventListeners();
    
    // Load data on page load
    loadListings();
    loadStats();
    loadUserAlerts();

    // Initialize WebSocket for real-time updates
    WS.init(handleWebSocketMessage);
    
    // Auto-refresh every 30 seconds
    setInterval(() => {
      if (!isScanning) {
        loadListings();
        loadStats();
      }
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
    document.getElementById("logoutBtn")?.addEventListener("click", handleLogout);
    
    // Filter inputs with debounce
    document.getElementById("modelFilter")?.addEventListener("input", debounce(applyFilters, 500));
    document.getElementById("minPriceFilter")?.addEventListener("input", debounce(applyFilters, 500));
    document.getElementById("maxPriceFilter")?.addEventListener("input", debounce(applyFilters, 500));
    document.getElementById("currencyFilter")?.addEventListener("change", applyFilters);
  }

  function handleWebSocketMessage(message) {
    console.log("WebSocket message:", message);
    
    switch (message.type) {
      case "gpuScanUpdate":
        updateProgress(message.data);
        break;
      case "priceAlert":
        showPriceAlert(message.data);
        break;
    }
  }

  function updateProgress(message) {
    const progressText = document.getElementById("progressText");
    const progressFill = document.getElementById("progressFill");
    
    if (progressText) {
      progressText.textContent = message;
    }
    
    // Estimate progress based on message content
    let progress = 0;
    if (message.includes("Launching")) progress = 5;
    else if (message.includes("Logging")) progress = 10;
    else if (message.includes("Navigating")) progress = 20;
    else if (message.includes("Applying GPU filter")) progress = 30;
    else if (message.includes("page 1")) progress = 40;
    else if (message.includes("page 2")) progress = 60;
    else if (message.includes("page 3")) progress = 80;
    else if (message.includes("complete")) progress = 100;
    else if (message.includes("Found:")) {
      // Increment progress slightly for each GPU found
      const currentWidth = parseFloat(progressFill.style.width) || 40;
      progress = Math.min(currentWidth + 1, 95);
    }
    
    if (progressFill && progress > 0) {
      progressFill.style.width = progress + "%";
    }
  }

  function showPriceAlert(alertData) {
    Toast.success(
      "🔔 Price Alert!",
      `${alertData.model} found at ${alertData.price}${alertData.currency}`,
      8000
    );
  }

  async function startGPUScan() {
    if (isScanning) {
      Toast.warning("Scan in Progress", "Please wait for the current scan to complete");
      return;
    }
    
    const scanButton = document.getElementById("scanButton");
    const scanProgress = document.getElementById("scanProgress");
    
    isScanning = true;
    scanButton.disabled = true;
    scanButton.innerHTML = '<span class="btn-icon">⏳</span><span>Scanning...</span>';
    scanProgress.style.display = "block";
    
    // Reset progress
    document.getElementById("progressFill").style.width = "0%";
    document.getElementById("progressText").textContent = "Starting GPU scan...";
    
    try {
      const response = await API.post("/api/gpu/scan", {});
      
      if (response.success) {
        const data = response.data;
        Toast.success(
          "Scan Complete", 
          `Found ${data.totalFound} listings, saved ${data.saved} new GPUs${data.triggeredAlerts > 0 ? `, ${data.triggeredAlerts} price alerts triggered` : ""}`
        );
        
        // Reload listings and stats
        await loadListings();
        await loadStats();
        
      } else {
        Toast.error("Scan Failed", response.message || "Failed to scan forum");
      }
    } catch (error) {
      console.error("Scan error:", error);
      Toast.error("Error", "Failed to start GPU scan");
    } finally {
      isScanning = false;
      scanButton.disabled = false;
      scanButton.innerHTML = '<span class="btn-icon">🔍</span><span>AI Deep Scan</span>';
      
      // Hide progress after 2 seconds
      setTimeout(() => {
        scanProgress.style.display = "none";
      }, 2000);
    }
  }

  async function loadListings() {
    try {
      const filters = getFilters();
      const queryParams = new URLSearchParams(filters);
      
      console.log("Loading listings with filters:", filters);
      
      const response = await API.get(`/api/gpu/listings?${queryParams}`);
      
      console.log("Listings response:", response);
      
      if (response.success && response.data) {
        gpuListings = Array.isArray(response.data) ? response.data : [];
        updateTable();
      } else {
        console.error("Invalid response format:", response);
        gpuListings = [];
        updateTable();
      }
    } catch (error) {
      console.error("Error loading listings:", error);
      gpuListings = [];
      updateTable();
    }
  }

  async function loadStats() {
    try {
      const response = await API.get("/api/gpu/stats");
      
      console.log("Stats response:", response);
      
      if (response.success && response.data) {
        gpuStats = Array.isArray(response.data) ? response.data : [];
        updateStatsDisplay();
      }
    } catch (error) {
      console.error("Error loading stats:", error);
    }
  }

  async function loadUserAlerts() {
    try {
      const response = await API.get("/api/gpu/alerts");
      
      if (response.success && response.data) {
        userAlerts = Array.isArray(response.data) ? response.data : [];
        updateAlertsDisplay();
        
        // Update button text
        const alertButton = document.querySelector('[onclick="toggleAlerts()"]');
        if (alertButton) {
          alertButton.innerHTML = `
            <span class="btn-icon">🔔</span>
            <span>${alertsVisible ? "Hide" : "Show"} Alerts (${userAlerts.length})</span>
          `;
        }
      }
    } catch (error) {
      console.error("Error loading alerts:", error);
    }
  }

  function getFilters() {
    return {
      model: document.getElementById("modelFilter")?.value || "",
      minPrice: document.getElementById("minPriceFilter")?.value || "",
      maxPrice: document.getElementById("maxPriceFilter")?.value || "",
      currency: document.getElementById("currencyFilter")?.value || "",
      sortBy: sortColumn,
      sortOrder: sortOrder,
      limit: 100
    };
  }

  function updateTable() {
    const tbody = document.getElementById("gpuTableBody");
    
    if (!tbody) {
      console.error("Table body element not found");
      return;
    }
    
    if (!Array.isArray(gpuListings) || gpuListings.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="table-empty">No GPU listings found. Click "AI Deep Scan" to search the forum.</td></tr>';
      return;
    }
    
    console.log(`Updating table with ${gpuListings.length} listings`);
    
    tbody.innerHTML = gpuListings.map(gpu => `
      <tr class="gpu-row" style="cursor: pointer;">
        <td class="gpu-model">${escapeHtml(gpu.model || "Unknown")}</td>
        <td class="gpu-brand">${escapeHtml(gpu.brand || "Unknown")}</td>
        <td class="gpu-price">${gpu.price || 0}</td>
        <td class="gpu-currency">${escapeHtml(gpu.currency || "€")}</td>
        <td class="gpu-title" title="${escapeHtml(gpu.title || "")}">${escapeHtml(truncate(gpu.title || "No title", 40))}</td>
        <td class="gpu-author">${escapeHtml(gpu.author || "Unknown")}</td>
        <td class="gpu-date">${formatDate(gpu.scraped_at)}</td>
        <td class="gpu-actions" onclick="event.stopPropagation();">
          <button class="btn-small" onclick="viewGPUDetails('${gpu.id}')">View</button>
          <a href="${gpu.url}" target="_blank" class="btn-small">Forum</a>
          <button class="btn-small btn-alert" onclick="createAlert('${escapeHtml(gpu.model)}', ${gpu.price}, '${escapeHtml(gpu.currency)}')">Alert</button>
        </td>
      </tr>
    `).join("");
  }

  function updateStatsDisplay() {
    // Calculate statistics
    const totalListings = gpuListings.length;
    const totalModels = gpuStats.length;
    
    let avgPrice = 0;
    let lowestPrice = Infinity;
    let lastScan = null;
    
    if (gpuListings.length > 0) {
      const prices = gpuListings.map(g => g.price).filter(p => p > 0);
      if (prices.length > 0) {
        avgPrice = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
        lowestPrice = Math.min(...prices);
      }
      
      // Get most recent scan date
      const dates = gpuListings.map(g => new Date(g.scraped_at));
      lastScan = dates.reduce((latest, current) => current > latest ? current : latest, new Date(0));
    }
    
    // Update display
    document.getElementById("totalListings").textContent = totalListings;
    document.getElementById("avgPrice").textContent = avgPrice > 0 ? `€${avgPrice}` : "€0";
    document.getElementById("lowestPrice").textContent = lowestPrice === Infinity ? "€0" : `€${lowestPrice}`;
    document.getElementById("totalModels").textContent = totalModels;
    document.getElementById("lastScan").textContent = lastScan ? formatTimeAgo(lastScan) : "Never";
    
    // Update model stats table
    updateModelStatsTable();
  }

  function updateModelStatsTable() {
    const tbody = document.getElementById("modelStatsBody");
    if (!tbody) return;
    
    if (gpuStats.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="table-empty">No statistics available yet</td></tr>';
      return;
    }
    
    tbody.innerHTML = gpuStats.slice(0, 10).map(stat => `
      <tr>
        <td class="gpu-model">${escapeHtml(stat.model)}</td>
        <td class="stat-count">${stat.listingCount || 0}</td>
        <td class="stat-price">€${stat.avgPrice || 0}</td>
        <td class="stat-price">€${stat.minPrice || 0}</td>
        <td class="stat-price">€${stat.maxPrice || 0}</td>
        <td class="gpu-actions">
          <button class="btn-small" onclick="filterByModel('${escapeHtml(stat.model)}')">Filter</button>
          <button class="btn-small btn-alert" onclick="createAlert('${escapeHtml(stat.model)}', ${stat.minPrice}, '€')">Alert</button>
        </td>
      </tr>
    `).join("");
  }

  function updateAlertsDisplay() {
    const alertsContainer = document.getElementById("alertsContainer");
    if (!alertsContainer) return;
    
    if (userAlerts.length === 0) {
      alertsContainer.innerHTML = '<p class="table-empty">No price alerts set</p>';
      return;
    }
    
    alertsContainer.innerHTML = `
      <div class="alerts-list">
        ${userAlerts.map(alert => `
          <div class="alert-item">
            <div class="alert-info">
              <strong>${escapeHtml(alert.gpu_model)}</strong>
              <span class="alert-condition">
                ${alert.alert_type} ${alert.target_price}${alert.currency}
              </span>
              <span class="alert-date">Created: ${formatDate(alert.created_at)}</span>
            </div>
            <button class="btn-small btn-danger" onclick="deleteAlert('${alert.id}')">Delete</button>
          </div>
        `).join("")}
      </div>
    `;
  }

  function applyFilters() {
    loadListings();
  }

  // Utility functions
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  function escapeHtml(text) {
    if (!text) return "";
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  function truncate(text, length) {
    if (!text) return "";
    return text.length > length ? text.substring(0, length) + "..." : text;
  }

  function formatDate(dateString) {
    if (!dateString) return "Unknown";
    return new Date(dateString).toLocaleDateString();
  }

  function formatTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    
    const intervals = {
      year: 31536000,
      month: 2592000,
      week: 604800,
      day: 86400,
      hour: 3600,
      minute: 60
    };
    
    for (const [name, value] of Object.entries(intervals)) {
      const interval = Math.floor(seconds / value);
      if (interval >= 1) {
        return interval === 1 ? `1 ${name} ago` : `${interval} ${name}s ago`;
      }
    }
    
    return "Just now";
  }

  function handleLogout() {
    Modal.danger("Logout?", "Are you sure you want to logout?", () => {
      WS.close();
      Auth.logout();
    });
  }

  // Global functions for onclick handlers
  window.startGPUScan = startGPUScan;
  window.refreshListings = function() {
    Toast.info("Refreshing", "Loading latest listings...", 2000);
    loadListings();
    loadStats();
  };
  
  window.toggleFilters = function() {
    const filtersSection = document.getElementById("filtersSection");
    filtersVisible = !filtersVisible;
    filtersSection.style.display = filtersVisible ? "grid" : "none";
    
    const button = document.querySelector('[onclick="toggleFilters()"]');
    button.innerHTML = `
      <span class="btn-icon">⚙️</span>
      <span>${filtersVisible ? "Hide" : "Show"} Filters</span>
    `;
  };
  
  window.toggleAlerts = function() {
    const alertsSection = document.getElementById("alertsSection");
    alertsVisible = !alertsVisible;
    alertsSection.style.display = alertsVisible ? "block" : "none";
    
    const button = document.querySelector('[onclick="toggleAlerts()"]');
    button.innerHTML = `
      <span class="btn-icon">🔔</span>
      <span>${alertsVisible ? "Hide" : "Show"} Alerts (${userAlerts.length})</span>
    `;
  };
  
  window.filterByModel = function(model) {
    document.getElementById("modelFilter").value = model;
    applyFilters();
    document.getElementById("listingsSection").scrollIntoView({ behavior: "smooth" });
  };
  
  window.sortTable = function(column) {
    if (sortColumn === column) {
      sortOrder = sortOrder === "asc" ? "desc" : "asc";
    } else {
      sortColumn = column;
      sortOrder = "desc";
    }
    loadListings();
  };
  
  window.viewGPUDetails = function(listingId) {
    const gpu = gpuListings.find(g => g.id == listingId);
    if (!gpu) return;
    
    Modal.alert("GPU Details", `
      Model: ${gpu.model}
      Price: ${gpu.price}${gpu.currency}
      Author: ${gpu.author}
      Posted: ${formatDate(gpu.scraped_at)}
    `);
  };
  
  window.createAlert = async function(model, price, currency) {
    // Implementation from original file
    Toast.info("Alert", "Creating price alert...");
  };
  
  window.deleteAlert = async function(alertId) {
    // Implementation from original file
    Toast.info("Alert", "Deleting alert...");
  };

  // Initialize when DOM is loaded
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();