// public/js/gpu-tracker.js - Enhanced with AI features and price alerts

(function () {
  "use strict";

  let gpuListings = [];
  let gpuStats = [];
  let userAlerts = [];
  let sortColumn = "scraped_at";
  let sortOrder = "desc";
  let filtersVisible = false;
  let alertsVisible = false;

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
    loadListings();
    loadStats();
    loadUserAlerts();

    // Initialize WebSocket for real-time updates
    WS.init(handleWebSocketMessage);
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
    document
      .getElementById("logoutBtn")
      .addEventListener("click", handleLogout);

    // Filter inputs
    document
      .getElementById("modelFilter")
      .addEventListener("input", debounce(applyFilters, 500));
    document
      .getElementById("minPriceFilter")
      .addEventListener("input", debounce(applyFilters, 500));
    document
      .getElementById("maxPriceFilter")
      .addEventListener("input", debounce(applyFilters, 500));
    document
      .getElementById("currencyFilter")
      .addEventListener("change", applyFilters);
  }

  function handleWebSocketMessage(message) {
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

    // Simple progress estimation based on message content
    let progress = 0;
    if (message.includes("Logging in")) progress = 10;
    else if (message.includes("Navigating")) progress = 20;
    else if (message.includes("page 1")) progress = 30;
    else if (message.includes("page 2")) progress = 50;
    else if (message.includes("page 3")) progress = 70;
    else if (message.includes("complete")) progress = 100;

    if (progressFill) {
      progressFill.style.width = progress + "%";
    }
  }

  function showPriceAlert(alertData) {
    Toast.success(
      "🔔 Price Alert!",
      `${alertData.model} found at ${alertData.price}${alertData.currency} (target: ${alertData.targetPrice}${alertData.currency})`,
      8000,
    );

    // Add visual indicator
    const alertBadge = document.createElement("div");
    alertBadge.className = "price-alert-badge";
    alertBadge.innerHTML = `
      <strong>🔔 Price Alert Triggered!</strong><br>
      ${alertData.model} - ${alertData.price}${alertData.currency}
      <a href="${alertData.url}" target="_blank" class="alert-link">View Listing</a>
    `;
    alertBadge.style.cssText = `
      position: fixed; top: 80px; right: 20px; 
      background: linear-gradient(135deg, #10b981, #059669);
      color: white; padding: 1rem; border-radius: 10px;
      box-shadow: 0 4px 15px rgba(16, 185, 129, 0.3);
      z-index: 1000; max-width: 300px;
      animation: slideInFromRight 0.4s ease;
    `;

    document.body.appendChild(alertBadge);

    setTimeout(() => {
      alertBadge.style.opacity = "0";
      setTimeout(() => alertBadge.remove(), 300);
    }, 8000);
  }

  async function startGPUScan() {
    const scanButton = document.getElementById("scanButton");
    const scanProgress = document.getElementById("scanProgress");

    scanButton.disabled = true;
    scanButton.innerHTML =
      '<span class="btn-icon">⏳</span><span>Scanning...</span>';
    scanProgress.style.display = "block";

    try {
      const response = await API.post("/api/gpu/scan", {});

      if (response.success) {
        Toast.success(
          "Scan Complete",
          `Found ${response.data?.totalListings || 0} listings, saved ${response.data?.savedListings || 0} GPU entries`,
        );
        loadListings();
        loadStats();
      } else {
        Toast.error("Scan Failed", response.error || "Failed to scan forum");
      }
    } catch (error) {
      Toast.error("Error", "Failed to start GPU scan");
    } finally {
      scanButton.disabled = false;
      scanButton.innerHTML =
        '<span class="btn-icon">🔍</span><span>Scan Forum</span>';
      scanProgress.style.display = "none";
    }
  }

  async function loadListings() {
    try {
      const filters = getFilters();
      const response = await API.get(
        `/api/gpu/listings?${new URLSearchParams(filters)}`,
      );

      if (response.success) {
        gpuListings = response.data || [];
        updateTable();
      }
    } catch (error) {
      console.error("Error loading listings:", error);
    }
  }

  async function loadStats() {
    try {
      const response = await API.get("/api/gpu/stats");

      if (response.success) {
        gpuStats = response.data || [];
        updateStatsDisplay();
      }
    } catch (error) {
      console.error("Error loading stats:", error);
    }
  }

  async function loadUserAlerts() {
    try {
      const response = await API.get("/api/gpu/alerts");

      if (response.success) {
        userAlerts = response.data || [];
        updateAlertsDisplay();
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
      limit: 100,
    };
  }

  function updateTable() {
    const tbody = document.getElementById("gpuTableBody");

    if (gpuListings.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="8" class="table-empty">No listings found</td></tr>';
      return;
    }

    tbody.innerHTML = gpuListings
      .map(
        (gpu) => `
      <tr onclick="viewGPUDetails('${gpu.id}')" class="gpu-row">
        <td class="gpu-model">${gpu.model || "Unknown"}</td>
        <td class="gpu-brand">${gpu.brand || "Unknown"}</td>
        <td class="gpu-price">${gpu.price}</td>
        <td class="gpu-currency">${gpu.currency}</td>
        <td class="gpu-title" title="${escapeHtml(gpu.title)}">${truncate(gpu.title, 40)}</td>
        <td class="gpu-author">${gpu.author}</td>
        <td class="gpu-date">${formatDate(gpu.scraped_at)}</td>
        <td class="gpu-actions">
          <button class="btn-small" onclick="event.stopPropagation(); viewGPUDetails('${gpu.id}')">View</button>
          <a href="${gpu.url}" target="_blank" class="btn-small" onclick="event.stopPropagation();">Forum</a>
          <button class="btn-small btn-alert" onclick="event.stopPropagation(); createAlert('${gpu.model}', ${gpu.price}, '${gpu.currency}')">Alert</button>
        </td>
      </tr>
    `,
      )
      .join("");
  }

  function updateStatsDisplay() {
    const totalListings = gpuListings.length;
    const totalModels = gpuStats.length;

    // Calculate overall stats
    let avgPrice = 0;
    let lowestPrice = Infinity;
    let lastScan = null;

    if (gpuStats.length > 0) {
      avgPrice = Math.round(
        gpuStats.reduce((sum, stat) => sum + stat.avgPrice, 0) /
          gpuStats.length,
      );
      lowestPrice = Math.min(...gpuStats.map((stat) => stat.minPrice));
      lastScan = gpuStats.reduce((latest, stat) => {
        const statDate = new Date(stat.latestDate);
        return statDate > latest ? statDate : latest;
      }, new Date(0));
    }

    document.getElementById("totalListings").textContent = totalListings;
    document.getElementById("avgPrice").textContent = `€${avgPrice}`;
    document.getElementById("lowestPrice").textContent =
      `€${lowestPrice === Infinity ? 0 : lowestPrice}`;
    document.getElementById("totalModels").textContent = totalModels;
    document.getElementById("lastScan").textContent = lastScan
      ? formatTimeAgo(lastScan)
      : "Never";

    // Update model stats table
    updateModelStatsTable();
  }

  function updateModelStatsTable() {
    const statsTableBody = document.getElementById("modelStatsBody");
    if (!statsTableBody) return;

    if (gpuStats.length === 0) {
      statsTableBody.innerHTML =
        '<tr><td colspan="6" class="table-empty">No model statistics available</td></tr>';
      return;
    }

    statsTableBody.innerHTML = gpuStats
      .slice(0, 10)
      .map(
        (stat) => `
      <tr>
        <td class="gpu-model">${stat.model}</td>
        <td class="stat-count">${stat.listingCount}</td>
        <td class="stat-price">€${stat.avgPrice}</td>
        <td class="stat-price">€${stat.minPrice}</td>
        <td class="stat-price">€${stat.maxPrice}</td>
        <td class="gpu-actions">
          <button class="btn-small" onclick="filterByModel('${stat.model}')">Filter</button>
          <button class="btn-small btn-alert" onclick="createAlert('${stat.model}', ${stat.minPrice}, '€')">Alert</button>
        </td>
      </tr>
    `,
      )
      .join("");
  }

  function updateAlertsDisplay() {
    const alertsContainer = document.getElementById("alertsContainer");
    if (!alertsContainer) return;

    if (userAlerts.length === 0) {
      alertsContainer.innerHTML =
        '<p class="table-empty">No price alerts set</p>';
      return;
    }

    alertsContainer.innerHTML = `
      <div class="alerts-list">
        ${userAlerts
          .map(
            (alert) => `
          <div class="alert-item">
            <div class="alert-info">
              <strong>${alert.gpu_model}</strong>
              <span class="alert-condition">
                ${alert.alert_type} ${alert.target_price}${alert.currency}
              </span>
              <span class="alert-date">Created: ${formatDate(alert.created_at)}</span>
            </div>
            <button class="btn-small btn-danger" onclick="deleteAlert('${alert.id}')">Delete</button>
          </div>
        `,
          )
          .join("")}
      </div>
    `;
  }

  function viewGPUDetails(listingId) {
    const gpu = gpuListings.find((g) => g.id === listingId);
    if (!gpu) return;

    const modalContent = `
      <div style="text-align: left;">
        <div style="margin-bottom: 1rem;">
          <strong style="color: #3b82f6;">Model:</strong> 
          <span style="color: #ccc;">${gpu.model}</span>
        </div>
        <div style="margin-bottom: 1rem;">
          <strong style="color: #3b82f6;">Brand:</strong> 
          <span style="color: #ccc;">${gpu.brand}</span>
        </div>
        <div style="margin-bottom: 1rem;">
          <strong style="color: #3b82f6;">Price:</strong> 
          <span style="color: #10b981; font-size: 1.2rem; font-weight: bold;">${gpu.price}${gpu.currency}</span>
        </div>
        <div style="margin-bottom: 1rem;">
          <strong style="color: #3b82f6;">Author:</strong> 
          <span style="color: #ccc;">${gpu.author}</span>
        </div>
        <div style="margin-bottom: 1rem;">
          <strong style="color: #3b82f6;">Posted:</strong> 
          <span style="color: #ccc;">${formatDate(gpu.scraped_at)}</span>
        </div>
        <div style="margin-bottom: 1.5rem;">
          <strong style="color: #3b82f6;">Title:</strong> 
          <span style="color: #ccc;">${gpu.title}</span>
        </div>
        <div style="margin-top: 1.5rem; display: flex; gap: 1rem;">
          <a href="${gpu.url}" target="_blank" class="btn btn-primary">
            View on Forum
          </a>
          <button class="btn btn-secondary" onclick="createAlert('${gpu.model}', ${gpu.price}, '${gpu.currency}')">
            Create Price Alert
          </button>
        </div>
      </div>
    `;

    Modal.show({
      type: "info",
      title: `${gpu.model} - GPU Details`,
      message: "",
      confirmText: "Close",
      confirmClass: "modal-btn-secondary",
      onConfirm: () => {},
    });

    setTimeout(() => {
      document.getElementById("modalBody").innerHTML = modalContent;
      document.getElementById("modalIcon").style.display = "none";
      document.getElementById("modalCancel").style.display = "none";
    }, 10);
  }

  async function createAlert(gpuModel, suggestedPrice, currency) {
    const modalContent = `
      <div style="text-align: left;">
        <p style="color: #aaa; margin-bottom: 1.5rem;">
          Set up a price alert for <strong>${gpuModel}</strong>. You'll be notified when a listing matches your criteria.
        </p>
        <div class="form-group" style="margin-bottom: 1rem;">
          <label style="color: #ccc; display: block; margin-bottom: 0.5rem;">
            GPU Model
          </label>
          <input type="text" id="alertModel" value="${gpuModel}" 
                 style="width: 100%; padding: 0.7rem; background: rgba(0,0,0,0.3); 
                        border: 1px solid #444; border-radius: 8px; color: white;">
        </div>
        <div class="form-group" style="margin-bottom: 1rem;">
          <label style="color: #ccc; display: block; margin-bottom: 0.5rem;">
            Target Price
          </label>
          <input type="number" id="alertPrice" value="${suggestedPrice}" min="1" max="10000"
                 style="width: 100%; padding: 0.7rem; background: rgba(0,0,0,0.3); 
                        border: 1px solid #444; border-radius: 8px; color: white;">
        </div>
        <div class="form-group" style="margin-bottom: 1rem;">
          <label style="color: #ccc; display: block; margin-bottom: 0.5rem;">
            Currency
          </label>
          <select id="alertCurrency" 
                  style="width: 100%; padding: 0.7rem; background: rgba(0,0,0,0.3); 
                         border: 1px solid #444; border-radius: 8px; color: white;">
            <option value="€" ${currency === "€" ? "selected" : ""}>Euro (€)</option>
            <option value="AH" ${currency === "AH" ? "selected" : ""}>AH</option>
            <option value="OK" ${currency === "OK" ? "selected" : ""}>OK</option>
          </select>
        </div>
        <div class="form-group">
          <label style="color: #ccc; display: block; margin-bottom: 0.5rem;">
            Alert When Price Is
          </label>
          <select id="alertType" 
                  style="width: 100%; padding: 0.7rem; background: rgba(0,0,0,0.3); 
                         border: 1px solid #444; border-radius: 8px; color: white;">
            <option value="below">Below target price</option>
            <option value="above">Above target price</option>
            <option value="exact">Near target price (±5%)</option>
          </select>
        </div>
      </div>
    `;

    Modal.show({
      type: "confirm",
      title: "Create Price Alert",
      message: "",
      confirmText: "Create Alert",
      cancelText: "Cancel",
      confirmClass: "modal-btn-primary",
      onConfirm: async () => {
        const model = document.getElementById("alertModel").value.trim();
        const price = parseFloat(document.getElementById("alertPrice").value);
        const selectedCurrency = document.getElementById("alertCurrency").value;
        const alertType = document.getElementById("alertType").value;

        if (!model || !price || price <= 0) {
          Toast.warning(
            "Invalid Input",
            "Please enter a valid model and price",
          );
          return;
        }

        try {
          const response = await API.post("/api/gpu/alerts", {
            gpuModel: model,
            targetPrice: price,
            currency: selectedCurrency,
            alertType: alertType,
          });

          if (response.success) {
            Toast.success(
              "Alert Created",
              `You'll be notified when ${model} is ${alertType} ${price}${selectedCurrency}`,
            );
            loadUserAlerts();
          } else {
            Toast.error(
              "Failed to Create Alert",
              response.error || "Unknown error",
            );
          }
        } catch (error) {
          Toast.error("Error", "Failed to create price alert");
        }
      },
    });

    setTimeout(() => {
      document.getElementById("modalBody").innerHTML = modalContent;
    }, 10);
  }

  async function deleteAlert(alertId) {
    Modal.danger(
      "Delete Alert?",
      "Are you sure you want to delete this price alert?",
      async () => {
        try {
          const response = await fetch(`/api/gpu/alerts/${alertId}`, {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${Auth.getToken()}`,
            },
          });

          const result = await response.json();

          if (result.success) {
            Toast.success("Alert Deleted", "Price alert has been removed");
            loadUserAlerts();
          } else {
            Toast.error("Delete Failed", result.error || "Unknown error");
          }
        } catch (error) {
          Toast.error("Error", "Failed to delete alert");
        }
      },
    );
  }

  function filterByModel(model) {
    document.getElementById("modelFilter").value = model;
    applyFilters();

    // Scroll to results
    document.getElementById("listingsSection").scrollIntoView({
      behavior: "smooth",
    });
  }

  window.sortTable = function (column) {
    if (sortColumn === column) {
      sortOrder = sortOrder === "asc" ? "desc" : "asc";
    } else {
      sortColumn = column;
      sortOrder = "desc";
    }

    // Update sort indicators
    document.querySelectorAll(".sort-indicator").forEach((el) => el.remove());
    const headerCell = document.querySelector(`th[onclick*="${column}"]`);
    if (headerCell) {
      const indicator = document.createElement("span");
      indicator.className = "sort-indicator";
      indicator.textContent = sortOrder === "asc" ? " ↑" : " ↓";
      headerCell.appendChild(indicator);
    }

    loadListings();
  };

  window.toggleFilters = function () {
    const filtersSection = document.getElementById("filtersSection");
    filtersVisible = !filtersVisible;
    filtersSection.style.display = filtersVisible ? "grid" : "none";

    const button = document.querySelector('[onclick="toggleFilters()"]');
    button.innerHTML = `
      <span class="btn-icon">⚙️</span>
      <span>${filtersVisible ? "Hide" : "Show"} Filters</span>
    `;
  };

  window.toggleAlerts = function () {
    const alertsSection = document.getElementById("alertsSection");
    alertsVisible = !alertsVisible;
    alertsSection.style.display = alertsVisible ? "block" : "none";

    const button = document.querySelector('[onclick="toggleAlerts()"]');
    button.innerHTML = `
      <span class="btn-icon">🔔</span>
      <span>${alertsVisible ? "Hide" : "Show"} Alerts (${userAlerts.length})</span>
    `;
  };

  function applyFilters() {
    loadListings();
  }

  window.refreshListings = function () {
    Toast.info("Refreshing", "Loading latest listings...", 2000);
    loadListings();
    loadStats();
  };

  window.startGPUScan = startGPUScan;
  window.viewGPUDetails = viewGPUDetails;
  window.createAlert = createAlert;
  window.deleteAlert = deleteAlert;
  window.filterByModel = filterByModel;

  function handleLogout() {
    Modal.danger("Logout?", "Are you sure you want to logout?", () => {
      WS.close();
      Auth.logout();
    });
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
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  function truncate(text, length) {
    return text.length > length ? text.substring(0, length) + "..." : text;
  }

  function formatDate(dateString) {
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
