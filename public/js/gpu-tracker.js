// public/js/gpu-tracker.js - Fixed version
(function () {
  "use strict";

  let gpuListings = [];
  let gpuStats = [];
  let sortColumn = "scraped_at";
  let sortOrder = "desc";

  function init() {
    console.log("GPU Tracker initializing...");

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
    console.log("Loading initial data...");
    loadListings();
    loadStats();

    // Initialize WebSocket
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
      ?.addEventListener("click", handleLogout);

    // Filter inputs
    document
      .getElementById("modelFilter")
      ?.addEventListener("input", debounce(applyFilters, 500));
    document
      .getElementById("minPriceFilter")
      ?.addEventListener("input", debounce(applyFilters, 500));
    document
      .getElementById("maxPriceFilter")
      ?.addEventListener("input", debounce(applyFilters, 500));
    document
      .getElementById("currencyFilter")
      ?.addEventListener("change", applyFilters);
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

    // Estimate progress
    let progress = 0;
    if (message.includes("Launching")) progress = 5;
    else if (message.includes("Logging")) progress = 10;
    else if (message.includes("Navigating")) progress = 20;
    else if (message.includes("Applying GPU filter")) progress = 30;
    else if (message.includes("page 1")) progress = 40;
    else if (message.includes("page 2")) progress = 60;
    else if (message.includes("page 3")) progress = 80;
    else if (message.includes("complete")) progress = 100;

    if (progressFill && progress > 0) {
      progressFill.style.width = progress + "%";
    }
  }

  async function loadListings() {
    try {
      console.log("Fetching GPU listings...");

      const filters = getFilters();
      const queryParams = new URLSearchParams(filters);
      const url = `/api/gpu/listings?${queryParams}`;

      console.log("Request URL:", url);

      // Make the API call directly with fetch to ensure we get the data
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${Auth.getToken()}`,
          "Content-Type": "application/json",
        },
      });

      const result = await response.json();

      console.log("API Response:", result);

      if (result.success && result.data) {
        gpuListings = Array.isArray(result.data) ? result.data : [];
        console.log(`Received ${gpuListings.length} GPU listings`);

        if (gpuListings.length > 0) {
          console.log("First listing:", gpuListings[0]);
        }

        updateTable();
      } else {
        console.error("Invalid response format:", result);
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
      console.log("Fetching GPU stats...");

      // Make the API call directly with fetch
      const response = await fetch("/api/gpu/stats", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${Auth.getToken()}`,
          "Content-Type": "application/json",
        },
      });

      const result = await response.json();

      console.log("Stats response:", result);

      if (result.success && result.data) {
        gpuStats = Array.isArray(result.data) ? result.data : [];
        console.log(`Received ${gpuStats.length} GPU model stats`);
        updateStatsDisplay();
      }
    } catch (error) {
      console.error("Error loading stats:", error);
    }
  }

  function getFilters() {
    const filters = {
      model: document.getElementById("modelFilter")?.value || "",
      minPrice: document.getElementById("minPriceFilter")?.value || "",
      maxPrice: document.getElementById("maxPriceFilter")?.value || "",
      currency: document.getElementById("currencyFilter")?.value || "",
      sortBy: sortColumn,
      sortOrder: sortOrder,
      limit: 100,
    };

    console.log("Current filters:", filters);
    return filters;
  }

  function updateTable() {
    console.log("Updating table with", gpuListings.length, "listings");

    const tbody = document.getElementById("gpuTableBody");

    if (!tbody) {
      console.error("Table body element 'gpuTableBody' not found!");
      return;
    }

    if (!Array.isArray(gpuListings) || gpuListings.length === 0) {
      console.log("No listings to display");
      tbody.innerHTML =
        '<tr><td colspan="8" class="table-empty">No GPU listings found. Click "AI Deep Scan" to search the forum.</td></tr>';
      return;
    }

    console.log("Rendering table rows...");

    tbody.innerHTML = gpuListings
      .map((gpu, index) => {
        // Log first few GPUs being rendered
        if (index < 3) {
          console.log(
            `Rendering GPU ${index + 1}: ${gpu.model} - ${gpu.price}${gpu.currency}`,
          );
        }

        return `
        <tr class="gpu-row">
          <td class="gpu-model">${escapeHtml(gpu.model || "Unknown")}</td>
          <td class="gpu-brand">${escapeHtml(gpu.brand || "Unknown")}</td>
          <td class="gpu-price">${gpu.price || 0}</td>
          <td class="gpu-currency">${escapeHtml(gpu.currency || "€")}</td>
          <td class="gpu-title" title="${escapeHtml(gpu.title || "")}">${escapeHtml(truncate(gpu.title || "No title", 40))}</td>
          <td class="gpu-author">${escapeHtml(gpu.author || "Unknown")}</td>
          <td class="gpu-date">${formatDate(gpu.scraped_at)}</td>
          <td class="gpu-actions">
            <button class="btn-small" onclick="viewGPUDetails('${gpu.id}')">View</button>
            <a href="${gpu.url}" target="_blank" class="btn-small">Forum</a>
          </td>
        </tr>
      `;
      })
      .join("");

    console.log("Table updated successfully with", gpuListings.length, "rows");
  }

  function updateStatsDisplay() {
    console.log("Updating stats display...");

    const totalListings = gpuListings.length;
    const totalModels = gpuStats.length;

    let avgPrice = 0;
    let lowestPrice = Infinity;

    if (gpuListings.length > 0) {
      const prices = gpuListings.map((g) => g.price).filter((p) => p > 0);
      if (prices.length > 0) {
        avgPrice = Math.round(
          prices.reduce((a, b) => a + b, 0) / prices.length,
        );
        lowestPrice = Math.min(...prices);
      }
    }

    // Update display elements
    const elements = {
      totalListings: document.getElementById("totalListings"),
      avgPrice: document.getElementById("avgPrice"),
      lowestPrice: document.getElementById("lowestPrice"),
      totalModels: document.getElementById("totalModels"),
    };

    if (elements.totalListings)
      elements.totalListings.textContent = totalListings;
    if (elements.avgPrice)
      elements.avgPrice.textContent = avgPrice > 0 ? `€${avgPrice}` : "€0";
    if (elements.lowestPrice)
      elements.lowestPrice.textContent =
        lowestPrice === Infinity ? "€0" : `€${lowestPrice}`;
    if (elements.totalModels) elements.totalModels.textContent = totalModels;

    console.log(
      `Stats updated: ${totalListings} listings, ${totalModels} models, avg price: €${avgPrice}`,
    );

    // Update model stats table
    updateModelStatsTable();
  }

  function updateModelStatsTable() {
    const tbody = document.getElementById("modelStatsBody");
    if (!tbody) {
      console.log("Model stats table body not found");
      return;
    }

    if (gpuStats.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="6" class="table-empty">No statistics available yet</td></tr>';
      return;
    }

    tbody.innerHTML = gpuStats
      .slice(0, 5)
      .map(
        (stat) => `
      <tr>
        <td class="gpu-model">${escapeHtml(stat.model)}</td>
        <td class="stat-count">${stat.listingCount || 0}</td>
        <td class="stat-price">€${stat.avgPrice || 0}</td>
        <td class="stat-price">€${stat.minPrice || 0}</td>
        <td class="stat-price">€${stat.maxPrice || 0}</td>
        <td class="gpu-actions">
          <button class="btn-small" onclick="filterByModel('${escapeHtml(stat.model)}')">Filter</button>
        </td>
      </tr>
    `,
      )
      .join("");
  }

  async function startGPUScan() {
    console.log("Starting GPU scan...");

    const scanButton = document.getElementById("scanButton");
    const scanProgress = document.getElementById("scanProgress");

    scanButton.disabled = true;
    scanButton.innerHTML =
      '<span class="btn-icon">⏳</span><span>Scanning...</span>';
    scanProgress.style.display = "block";

    // Reset progress
    document.getElementById("progressFill").style.width = "0%";
    document.getElementById("progressText").textContent =
      "Starting GPU scan...";

    try {
      // Use fetch directly for the scan
      const response = await fetch("/api/gpu/scan", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${Auth.getToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      const result = await response.json();

      console.log("Scan response:", result);

      if (result.success) {
        const data = result.data;
        Toast.success(
          "Scan Complete",
          `Found ${data.totalFound} listings, saved ${data.saved} new GPUs`,
        );

        // Reload listings
        await loadListings();
        await loadStats();
      } else {
        Toast.error("Scan Failed", result.message || "Failed to scan forum");
      }
    } catch (error) {
      console.error("Scan error:", error);
      Toast.error("Error", "Failed to start GPU scan");
    } finally {
      scanButton.disabled = false;
      scanButton.innerHTML =
        '<span class="btn-icon">🔍</span><span>AI Deep Scan</span>';

      setTimeout(() => {
        scanProgress.style.display = "none";
      }, 2000);
    }
  }

  function applyFilters() {
    console.log("Applying filters...");
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

  function handleLogout() {
    Modal.danger("Logout?", "Are you sure you want to logout?", () => {
      WS.close();
      Auth.logout();
    });
  }

  function showPriceAlert(alertData) {
    Toast.success(
      "🔔 Price Alert!",
      `${alertData.model} found at ${alertData.price}${alertData.currency}`,
      8000,
    );
  }

  window.checkDuplicates = async function () {
    try {
      const response = await fetch("/api/gpu/duplicates", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${Auth.getToken()}`,
          "Content-Type": "application/json",
        },
      });

      const result = await response.json();

      if (result.success) {
        const stats = result.data;
        const message = `
        Total Listings: ${stats.totalListings}
        Unique Listings: ${stats.uniqueListings}
        Duplicate Groups: ${stats.duplicateGroups}
        
        Remove duplicates?
      `;

        if (confirm(message)) {
          removeDuplicates();
        }
      }
    } catch (error) {
      console.error("Error checking duplicates:", error);
      Toast.error("Error", "Failed to check duplicates");
    }
  };

  window.removeDuplicates = async function () {
    try {
      const response = await fetch("/api/gpu/remove-duplicates", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${Auth.getToken()}`,
          "Content-Type": "application/json",
        },
      });

      const result = await response.json();

      if (result.success) {
        Toast.success("Duplicates Removed", result.message);
        loadListings(); // Reload the listings
      } else {
        Toast.error("Failed", result.error || "Failed to remove duplicates");
      }
    } catch (error) {
      console.error("Error removing duplicates:", error);
      Toast.error("Error", "Failed to remove duplicates");
    }
  };

  window.clearDatabase = async function () {
    if (
      !confirm(
        "⚠️ WARNING: This will delete ALL GPU listings from the database. Are you sure?",
      )
    ) {
      return;
    }

    if (!confirm("This action cannot be undone. Continue?")) {
      return;
    }

    try {
      const response = await fetch("/api/gpu/clear-all", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${Auth.getToken()}`,
          "Content-Type": "application/json",
        },
      });

      const result = await response.json();

      if (result.success) {
        Toast.success("Database Cleared", "All GPU listings have been removed");
        loadListings(); // Reload (will show empty)
      } else {
        Toast.error("Failed", result.error || "Failed to clear database");
      }
    } catch (error) {
      console.error("Error clearing database:", error);
      Toast.error("Error", "Failed to clear database");
    }
  };

  // Global functions
  window.startGPUScan = startGPUScan;
  window.refreshListings = function () {
    console.log("Refreshing listings...");
    Toast.info("Refreshing", "Loading latest listings...", 2000);
    loadListings();
    loadStats();
  };

  window.toggleFilters = function () {
    const filtersSection = document.getElementById("filtersSection");
    const isVisible = filtersSection.style.display === "grid";
    filtersSection.style.display = isVisible ? "none" : "grid";
  };

  window.filterByModel = function (model) {
    console.log("Filtering by model:", model);
    document.getElementById("modelFilter").value = model;
    applyFilters();
  };

  window.viewGPUDetails = function (id) {
    const gpu = gpuListings.find((g) => g.id == id);
    if (gpu) {
      console.log("Viewing GPU details:", gpu);
      alert(
        `GPU: ${gpu.model}\nPrice: ${gpu.price}${gpu.currency}\nAuthor: ${gpu.author}`,
      );
    }
  };

  // Initialize when DOM is loaded
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
