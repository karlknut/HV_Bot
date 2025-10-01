// public/js/gpu-tracker.js - Fixed version with auto-update and Type column
(function () {
  "use strict";

  let gpuListings = [];
  let filteredListings = [];
  let gpuStats = [];
  let currentPage = 1;
  let itemsPerPage = 10;
  let sortColumn = "scraped_at";
  let sortOrder = "desc";
  let currentFilter = null;
  let filterApplied = false;

  // Track if we're coming from another page
  let lastPage = document.referrer;
  let isInitialLoad = true;

  function init() {
    console.log("Enhanced GPU Tracker initializing...");

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
    setupPaginationControls();

    // FIXED: Always load data on initialization
    console.log("Loading initial data...");
    loadAllData();
    isInitialLoad = false;

    // FIXED: Only reload when navigating FROM dashboard or status page
    window.addEventListener("pageshow", function (event) {
      // Check if coming from another page on our site
      const currentReferrer = document.referrer;
      const isDashboard = currentReferrer.includes("/dashboard");
      const isStatus = currentReferrer.includes("/status");

      // Only refresh if coming from dashboard or status, not on F5 or tab switch
      if (
        !isInitialLoad &&
        (isDashboard || isStatus) &&
        event.persisted === false
      ) {
        console.log("Navigated from another page, refreshing data...");
        loadAllData();
      }
    });

    WS.init(handleWebSocketMessage);
  }

  // FIXED: New function to load all data at once
  async function loadAllData() {
    try {
      console.log("Loading all GPU data...");

      // Load listings and stats in parallel
      const [listingsResult, statsResult] = await Promise.all([
        loadListings(),
        loadStats(),
      ]);

      console.log("All data loaded successfully");

      // Update the last scan time after data is loaded
      updateLastScanTime();

      return true;
    } catch (error) {
      console.error("Error loading data:", error);
      Toast.error("Load Error", "Failed to load GPU data");
      return false;
    }
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

    setupClearFiltersButton();
  }

  function setupClearFiltersButton() {
    const filtersSection = document.getElementById("filtersSection");
    if (!filtersSection) return;

    let clearBtn = document.getElementById("clearFiltersBtn");
    if (!clearBtn) {
      clearBtn = document.createElement("button");
      clearBtn.id = "clearFiltersBtn";
      clearBtn.className = "btn btn-secondary";
      clearBtn.innerHTML =
        '<span class="btn-icon">✖</span><span>Clear Filters</span>';
      clearBtn.onclick = clearAllFilters;
      clearBtn.style.gridColumn = "span 4";
      clearBtn.style.marginTop = "1rem";
      filtersSection.appendChild(clearBtn);
    }

    const controlsSection = document.querySelector(".controls-section");
    if (controlsSection) {
      let quickClearBtn = document.getElementById("quickClearBtn");
      if (!quickClearBtn) {
        quickClearBtn = document.createElement("button");
        quickClearBtn.id = "quickClearBtn";
        quickClearBtn.className = "btn btn-secondary";
        quickClearBtn.innerHTML =
          '<span class="btn-icon">🔄</span><span>Reset Filters</span>';
        quickClearBtn.onclick = clearAllFilters;
        quickClearBtn.style.display = "none";
        controlsSection.appendChild(quickClearBtn);
      }
    }
  }

  function setupPaginationControls() {
    const listingsSection = document.getElementById("listingsSection");
    if (!listingsSection) return;

    let paginationControls = document.getElementById("paginationControls");
    if (!paginationControls) {
      const paginationHTML = `
        <div id="paginationControls" style="display: flex; justify-content: space-between; align-items: center; margin: 1rem 0;">
          <div>
            <label style="color: #aaa; margin-right: 0.5rem;">Show:</label>
            <select id="itemsPerPageSelect" style="background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.2); color: white; padding: 0.3rem; border-radius: 5px;">
              <option value="10" selected>10</option>
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="200">200</option>
            </select>
            <span style="color: #aaa; margin-left: 1rem;">
              Showing <span id="showingFrom">0</span>-<span id="showingTo">0</span> of <span id="totalItems">0</span>
            </span>
          </div>
          <div>
            <button id="prevPageBtn" class="btn-small" style="margin-right: 0.5rem;">← Previous</button>
            <span id="pageInfo" style="color: #aaa; margin: 0 1rem;">Page <span id="currentPageNum">1</span> of <span id="totalPages">1</span></span>
            <button id="nextPageBtn" class="btn-small">Next →</button>
          </div>
        </div>
      `;

      const tableContainer = listingsSection.querySelector(".table-container");
      if (tableContainer) {
        tableContainer.insertAdjacentHTML("beforebegin", paginationHTML);
        tableContainer.insertAdjacentHTML(
          "afterend",
          paginationHTML.replace(
            "paginationControls",
            "paginationControlsBottom",
          ),
        );
      }

      document
        .getElementById("itemsPerPageSelect")
        ?.addEventListener("change", (e) => {
          itemsPerPage = parseInt(e.target.value);
          currentPage = 1;
          updateTable();
        });

      document.getElementById("prevPageBtn")?.addEventListener("click", () => {
        if (currentPage > 1) {
          currentPage--;
          updateTable();
        }
      });

      document.getElementById("nextPageBtn")?.addEventListener("click", () => {
        const totalPages = Math.ceil(filteredListings.length / itemsPerPage);
        if (currentPage < totalPages) {
          currentPage++;
          updateTable();
        }
      });

      document
        .querySelector("#paginationControlsBottom select")
        ?.addEventListener("change", (e) => {
          itemsPerPage = parseInt(e.target.value);
          currentPage = 1;
          updateTable();
          document.getElementById("itemsPerPageSelect").value = e.target.value;
        });

      document
        .querySelector("#paginationControlsBottom button:first-child")
        ?.addEventListener("click", () => {
          if (currentPage > 1) {
            currentPage--;
            updateTable();
          }
        });

      document
        .querySelector("#paginationControlsBottom button:last-child")
        ?.addEventListener("click", () => {
          const totalPages = Math.ceil(filteredListings.length / itemsPerPage);
          if (currentPage < totalPages) {
            currentPage++;
            updateTable();
          }
        });
    }
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
      case "gpuScanCompleted":
        setTimeout(() => {
          loadAllData();
        }, 1000);
        break;
    }
  }

  function updateProgress(message) {
    const progressText = document.getElementById("progressText");
    const progressFill = document.getElementById("progressFill");

    if (progressText) {
      progressText.textContent = message;
    }

    let progress = 0;
    if (message.includes("Launching")) progress = 5;
    else if (message.includes("Logging")) progress = 10;
    else if (message.includes("page 2")) progress = 30;
    else if (message.includes("page 3")) progress = 40;
    else if (message.includes("page 4")) progress = 50;
    else if (message.includes("page 5")) progress = 60;
    else if (message.includes("page 6")) progress = 70;
    else if (message.includes("page 7")) progress = 80;
    else if (message.includes("page 8")) progress = 90;
    else if (message.includes("complete")) progress = 100;

    if (progressFill && progress > 0) {
      progressFill.style.width = progress + "%";
    }
  }

  async function loadListings() {
    try {
      console.log("Fetching GPU listings...");

      const filters = getFilters();
      const queryParams = new URLSearchParams({
        ...filters,
        limit: 1000,
      });
      const url = `/api/gpu/listings?${queryParams}`;

      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${Auth.getToken()}`,
          "Content-Type": "application/json",
        },
      });

      const result = await response.json();

      if (result.success && result.data) {
        gpuListings = Array.isArray(result.data) ? result.data : [];
        filteredListings = [...gpuListings];
        console.log(`Received ${gpuListings.length} GPU listings`);

        currentPage = 1;
        updateTable();
      } else {
        console.error("Invalid response format:", result);
        gpuListings = [];
        filteredListings = [];
        updateTable();
      }
    } catch (error) {
      console.error("Error loading listings:", error);
      gpuListings = [];
      filteredListings = [];
      updateTable();
    }
  }

  function updateModelStatsTable() {
    const tbody = document.getElementById("modelStatsBody");
    if (!tbody) {
      console.error("modelStatsBody element not found!");
      return;
    }

    console.log(`Updating model stats table with ${gpuStats.length} models`);

    if (!gpuStats || gpuStats.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="6" class="table-empty">No statistics available yet. Run a GPU scan to collect data.</td></tr>';
      return;
    }

    // Sort by listing count and take top 5
    const topModels = [...gpuStats]
      .sort(
        (a, b) =>
          (b.listingCount || b.count || 0) - (a.listingCount || a.count || 0),
      )
      .slice(0, 5);

    tbody.innerHTML = topModels
      .map(
        (stat) => `
      <tr>
        <td class="gpu-model">${escapeHtml(stat.model)}</td>
        <td class="stat-count">${stat.listingCount || stat.count || 0}</td>
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

    console.log("Model stats table updated successfully");
  }

  async function loadStats() {
    try {
      console.log("Loading GPU statistics...");

      const response = await fetch("/api/gpu/stats", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${Auth.getToken()}`,
          "Content-Type": "application/json",
        },
      });

      const result = await response.json();
      console.log("Stats API response:", result);

      if (result.success && result.data) {
        // Handle both nested and direct data structure
        gpuStats = Array.isArray(result.data)
          ? result.data
          : result.data.stats || [];
        console.log(`Loaded ${gpuStats.length} GPU model statistics`);
        updateStatsDisplay();
        updateModelStatsTable();
      } else {
        console.error("Failed to load stats:", result);
        gpuStats = [];
        updateModelStatsTable(); // Still update table to show empty state
      }
    } catch (error) {
      console.error("Error loading stats:", error);
      gpuStats = [];
      updateModelStatsTable(); // Update table to show error state
    }
  }

  function getFilters() {
    const filters = {
      model:
        currentFilter || document.getElementById("modelFilter")?.value || "",
      minPrice: document.getElementById("minPriceFilter")?.value || "",
      maxPrice: document.getElementById("maxPriceFilter")?.value || "",
      currency: document.getElementById("currencyFilter")?.value || "",
      sortBy: sortColumn,
      sortOrder: sortOrder,
    };

    return filters;
  }

  function updateTable() {
    console.log("Updating table with", filteredListings.length, "listings");

    const tbody = document.getElementById("gpuTableBody");

    if (!tbody) {
      console.error("Table body element 'gpuTableBody' not found!");
      return;
    }

    const totalItems = filteredListings.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
    const pageListings = filteredListings.slice(startIndex, endIndex);

    updatePaginationInfo(startIndex, endIndex, totalItems, totalPages);

    if (pageListings.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="10" class="table-empty">No GPU listings found. Click "Deep Scan" to search the forum.</td></tr>';
      return;
    }

    // FIXED: Enhanced table rendering with Type column and post date
    tbody.innerHTML = pageListings
      .map((gpu) => {
        // Determine price type for Type column
        let priceType = "OK"; // Default
        if (gpu.ah_price && gpu.ok_price) {
          priceType = "AH + OK";
        } else if (gpu.ah_price) {
          priceType = "AH";
        }

        // Build price display for Price column
        let priceDisplay = "";
        if (gpu.ah_price && gpu.ok_price) {
          priceDisplay = `<span style="color: #f59e0b;">AH: ${gpu.ah_price}€</span><br><span style="color: #a855f7;">OK: ${gpu.ok_price}€</span>`;
        } else if (gpu.ah_price) {
          priceDisplay = `<span style="color: #f59e0b;">AH: ${gpu.ah_price}€</span>`;
        } else if (gpu.ok_price) {
          priceDisplay = `<span style="color: #a855f7;">OK: ${gpu.ok_price}€</span>`;
        } else {
          priceDisplay = `${gpu.price || 0} ${escapeHtml(gpu.currency || "€")}`;
        }

        return `
        <tr class="gpu-row" onclick="viewGPUDetails('${gpu.id}')">
          <td class="gpu-model">${escapeHtml(gpu.model)}</td>
          <td class="gpu-brand">${escapeHtml(gpu.brand || "Unknown")}</td>
          <td class="gpu-price">${priceDisplay}</td>
          <td class="gpu-currency" style="font-weight: 600; color: ${priceType.includes("AH") ? "#f59e0b" : "#a855f7"};">${priceType}</td>
          <td class="gpu-title" title="${escapeHtml(gpu.title || "")}">${escapeHtml(truncate(gpu.title || "No title", 40))}</td>
          <td class="gpu-location">${escapeHtml(gpu.location || "Not specified")}</td>
          <td class="gpu-author">${escapeHtml(gpu.author || "Unknown")}</td>
          <td class="gpu-date">${formatDate(gpu.forum_post_date || gpu.scraped_at)}</td>
          <td class="gpu-actions">
            <button class="btn-small" onclick="event.stopPropagation(); viewGPUDetails('${gpu.id}')" title="View Details">
              View
            </button>
            <a href="${gpu.url}" target="_blank" class="btn-small" onclick="event.stopPropagation()">Forum</a>
          </td>
        </tr>
      `;
      })
      .join("");

    console.log("Table updated successfully");
  }

  function updatePaginationInfo(startIndex, endIndex, totalItems, totalPages) {
    document.getElementById("showingFrom").textContent =
      totalItems > 0 ? startIndex + 1 : 0;
    document.getElementById("showingTo").textContent = endIndex;
    document.getElementById("totalItems").textContent = totalItems;
    document.getElementById("currentPageNum").textContent = currentPage;
    document.getElementById("totalPages").textContent = totalPages;

    const bottomControls = document.getElementById("paginationControlsBottom");
    if (bottomControls) {
      const showingFromBottom = bottomControls.querySelector("#showingFrom");
      const showingToBottom = bottomControls.querySelector("#showingTo");
      const totalItemsBottom = bottomControls.querySelector("#totalItems");
      const currentPageNumBottom =
        bottomControls.querySelector("#currentPageNum");
      const totalPagesBottom = bottomControls.querySelector("#totalPages");

      if (showingFromBottom)
        showingFromBottom.textContent = totalItems > 0 ? startIndex + 1 : 0;
      if (showingToBottom) showingToBottom.textContent = endIndex;
      if (totalItemsBottom) totalItemsBottom.textContent = totalItems;
      if (currentPageNumBottom) currentPageNumBottom.textContent = currentPage;
      if (totalPagesBottom) totalPagesBottom.textContent = totalPages;
    }

    document.getElementById("prevPageBtn").disabled = currentPage === 1;
    document.getElementById("nextPageBtn").disabled =
      currentPage === totalPages || totalPages === 0;

    if (bottomControls) {
      const prevBtnBottom = bottomControls.querySelector("button:first-child");
      const nextBtnBottom = bottomControls.querySelector("button:last-child");
      if (prevBtnBottom) prevBtnBottom.disabled = currentPage === 1;
      if (nextBtnBottom)
        nextBtnBottom.disabled = currentPage === totalPages || totalPages === 0;
    }
  }

  function updateStatsDisplay() {
    console.log("Updating stats display...");

    const totalListings = gpuListings.length;
    const totalModels = gpuStats.length;

    const elements = {
      totalListings: document.getElementById("totalListings"),
      avgPrice: document.getElementById("avgPrice"),
      lowestPrice: document.getElementById("lowestPrice"),
      totalModels: document.getElementById("totalModels"),
      lastScan: document.getElementById("lastScan"),
    };

    // Update total listings
    if (elements.totalListings) {
      elements.totalListings.textContent = totalListings;
    }

    // Calculate and display prices
    if (filterApplied && currentFilter) {
      const prices = filteredListings.map((g) => g.price).filter((p) => p > 0);
      if (prices.length > 0) {
        const avgPrice = Math.round(
          prices.reduce((a, b) => a + b, 0) / prices.length,
        );
        const lowestPrice = Math.min(...prices);

        if (elements.avgPrice) {
          elements.avgPrice.textContent = `€${avgPrice}`;
          elements.avgPrice.parentElement.style.display = "block";
        }
        if (elements.lowestPrice) {
          elements.lowestPrice.textContent = `€${lowestPrice}`;
        }
      }
    } else {
      if (elements.avgPrice) {
        elements.avgPrice.parentElement.style.display = "none";
      }

      if (elements.lowestPrice) {
        const allPrices = gpuListings.map((g) => g.price).filter((p) => p > 0);
        if (allPrices.length > 0) {
          const lowestPrice = Math.min(...allPrices);
          elements.lowestPrice.textContent = `€${lowestPrice}`;
        } else {
          elements.lowestPrice.textContent = "€0";
        }
      }
    }

    if (elements.totalModels) {
      elements.totalModels.textContent = totalModels;
    }

    // Fixed Last Scan time update
    if (elements.lastScan) {
      updateLastScanTime();
    }
  }

  function updateLastScanTime() {
    const lastScanElement = document.getElementById("lastScan");
    if (!lastScanElement) return;

    // Check localStorage for recent scan
    const lastScanTime = localStorage.getItem("lastGPUScanTime");
    if (lastScanTime) {
      const scanDate = new Date(lastScanTime);
      if (!isNaN(scanDate.getTime())) {
        // Check if scan was recent (within last hour)
        const hourAgo = new Date(Date.now() - 3600000);
        if (scanDate > hourAgo) {
          lastScanElement.textContent = formatTimeAgo(scanDate);
          return;
        }
      }
    }

    // Otherwise, get from listings
    if (gpuListings.length > 0) {
      const dates = gpuListings
        .map((gpu) => {
          if (gpu.scraped_at) {
            const date = new Date(gpu.scraped_at);
            return isNaN(date.getTime()) ? null : date;
          }
          return null;
        })
        .filter((date) => date !== null);

      if (dates.length > 0) {
        const latestDate = dates.reduce((latest, date) =>
          date > latest ? date : latest,
        );
        lastScanElement.textContent = formatTimeAgo(latestDate);
      } else {
        lastScanElement.textContent = "Never";
      }
    } else {
      lastScanElement.textContent = "Never";
    }
  }

  function formatTimeAgo(date) {
    const dateObj = typeof date === "string" ? new Date(date) : date;

    if (!dateObj || isNaN(dateObj.getTime())) {
      return "Unknown";
    }

    const now = new Date();
    const diffMs = now - dateObj;
    const diffSeconds = Math.floor(diffMs / 1000);

    if (diffSeconds < 0) return "Just now";
    if (diffSeconds < 60) return "Just now";

    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes}m ago`;

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;

    return dateObj.toLocaleDateString();
  }

  async function startGPUScan() {
    console.log("Starting Enhanced GPU scan...");

    const scanButton = document.getElementById("scanButton");
    const scanProgress = document.getElementById("scanProgress");

    scanButton.disabled = true;
    scanButton.innerHTML =
      '<span class="btn-icon">⏳</span><span>Scanning...</span>';
    scanProgress.style.display = "block";

    document.getElementById("progressFill").style.width = "0%";
    document.getElementById("progressText").textContent =
      "Starting enhanced GPU scan...";

    try {
      const response = await fetch("/api/gpu/scan", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${Auth.getToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      const result = await response.json();

      if (result.success) {
        const data = result.data;

        // Store the scan completion time
        const scanTime = new Date().toISOString();
        localStorage.setItem("lastGPUScanTime", scanTime);

        Toast.success(
          "Scan Complete",
          `Found ${data.totalFound} listings, saved ${data.saved} new GPUs`,
        );

        // Reload all data including stats
        await loadAllData();

        // Force update the last scan display
        const lastScanElement = document.getElementById("lastScan");
        if (lastScanElement) {
          lastScanElement.textContent = "Just now";
        }
      } else {
        Toast.error("Scan Failed", result.message || "Failed to scan forum");
      }
    } catch (error) {
      console.error("Scan error:", error);
      Toast.error("Error", "Failed to start GPU scan");
    } finally {
      scanButton.disabled = false;
      scanButton.innerHTML =
        '<span class="btn-icon">🔍</span><span>Deep Scan</span>';

      setTimeout(() => {
        scanProgress.style.display = "none";
      }, 2000);
    }
  }

  function applyFilters() {
    console.log("Applying filters...");

    const filters = getFilters();

    filterApplied = !!(
      filters.model ||
      filters.minPrice ||
      filters.maxPrice ||
      filters.currency
    );

    const quickClearBtn = document.getElementById("quickClearBtn");
    if (quickClearBtn) {
      quickClearBtn.style.display = filterApplied ? "block" : "none";
    }

    filteredListings = gpuListings.filter((gpu) => {
      if (
        filters.model &&
        !gpu.model.toLowerCase().includes(filters.model.toLowerCase())
      ) {
        return false;
      }

      if (filters.minPrice && gpu.price < parseFloat(filters.minPrice)) {
        return false;
      }

      if (filters.maxPrice && gpu.price > parseFloat(filters.maxPrice)) {
        return false;
      }

      if (filters.currency && gpu.currency !== filters.currency) {
        return false;
      }

      return true;
    });

    filteredListings.sort((a, b) => {
      let aVal = a[sortColumn];
      let bVal = b[sortColumn];

      if (sortColumn === "price") {
        aVal = parseFloat(aVal) || 0;
        bVal = parseFloat(bVal) || 0;
      } else if (sortColumn === "scraped_at") {
        aVal = new Date(aVal);
        bVal = new Date(bVal);
      }

      if (sortOrder === "asc") {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });

    currentPage = 1;
    updateTable();
    updateStatsDisplay();
  }

  function clearAllFilters() {
    console.log("Clearing all filters...");

    document.getElementById("modelFilter").value = "";
    document.getElementById("minPriceFilter").value = "";
    document.getElementById("maxPriceFilter").value = "";
    document.getElementById("currencyFilter").value = "";

    currentFilter = null;
    filterApplied = false;

    const quickClearBtn = document.getElementById("quickClearBtn");
    if (quickClearBtn) {
      quickClearBtn.style.display = "none";
    }

    filteredListings = [...gpuListings];
    currentPage = 1;

    updateTable();
    updateStatsDisplay();

    Toast.info("Filters Cleared", "Showing all GPU listings");
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

    const date = new Date(dateString);

    // Check if date is valid
    if (isNaN(date.getTime())) {
      // Try to parse Estonian date format if it's not ISO
      const estonianDate = parseEstonianDateFormat(dateString);
      if (estonianDate) {
        return estonianDate.toLocaleDateString();
      }
      return "Unknown";
    }

    // Format as local date
    return date.toLocaleDateString();
  }

  function parseEstonianDateFormat(dateString) {
    if (!dateString) return null;

    // Try DD.MM.YYYY format
    const ddmmyyyy = dateString.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (ddmmyyyy) {
      const day = parseInt(ddmmyyyy[1]);
      const month = parseInt(ddmmyyyy[2]) - 1;
      const year = parseInt(ddmmyyyy[3]);
      const date = new Date(year, month, day);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }

    // Try other formats...
    return null;
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

  // Global functions
  window.startGPUScan = startGPUScan;

  window.refreshListings = function () {
    console.log("Refreshing listings...");
    Toast.info("Refreshing", "Loading latest listings...", 2000);
    loadAllData();
  };

  window.toggleFilters = function () {
    const filtersSection = document.getElementById("filtersSection");
    const isVisible = filtersSection.style.display === "grid";
    filtersSection.style.display = isVisible ? "none" : "grid";
  };

  window.filterByModel = function (model) {
    console.log("Filtering by model:", model);
    currentFilter = model;
    document.getElementById("modelFilter").value = model;

    const filtersSection = document.getElementById("filtersSection");
    filtersSection.style.display = "grid";

    applyFilters();
  };

  window.sortTable = function (column) {
    if (sortColumn === column) {
      sortOrder = sortOrder === "asc" ? "desc" : "asc";
    } else {
      sortColumn = column;
      sortOrder = "desc";
    }
    applyFilters();
  };

  // FIXED: Enhanced GPU details modal in ENGLISH with proper price display
  window.viewGPUDetails = function (id) {
    const gpu = gpuListings.find((g) => g.id == id);
    if (!gpu) return;

    console.log("Viewing GPU details:", gpu);

    // Get full model name (e.g., "ASUS ROG Astral GeForce RTX 5090")
    const fullModelName =
      gpu.full_model || `${gpu.brand || ""} ${gpu.model}`.trim();

    // FIXED: Build price details with BOTH AH and OK displayed separately when available
    let priceDetails = "";

    if (gpu.ah_price && gpu.ok_price) {
      // Show both prices
      priceDetails = `
      <div style="margin-bottom: 1rem;">
        <strong style="color: #3b82f6;">Prices:</strong><br>
        <div style="margin-left: 1rem; margin-top: 0.5rem;">
          <div style="margin-bottom: 0.5rem;">
            <span style="color: #f59e0b; font-size: 1.2rem; font-weight: bold;">
              AH: ${gpu.ah_price}€
            </span>
          </div>
          <div>
            <span style="color: #a855f7; font-size: 1.2rem; font-weight: bold;">
              OK: ${gpu.ok_price}€
            </span>
          </div>
        </div>
      </div>
    `;
    } else if (gpu.ah_price) {
      // Only AH price
      priceDetails = `
      <div style="margin-bottom: 1rem;">
        <strong style="color: #3b82f6;">Price (AH):</strong> 
        <span style="color: #f59e0b; font-size: 1.3rem; font-weight: bold;">
          ${gpu.ah_price}€
        </span>
      </div>
    `;
    } else if (gpu.ok_price) {
      // Only OK price
      priceDetails = `
      <div style="margin-bottom: 1rem;">
        <strong style="color: #3b82f6;">Price (OK):</strong> 
        <span style="color: #a855f7; font-size: 1.3rem; font-weight: bold;">
          ${gpu.ok_price}€
        </span>
      </div>
    `;
    } else if (gpu.price) {
      // Default price (treat as OK)
      priceDetails = `
      <div style="margin-bottom: 1rem;">
        <strong style="color: #3b82f6;">Price:</strong> 
        <span style="color: #10b981; font-size: 1.3rem; font-weight: bold;">
          ${gpu.price}€
        </span>
      </div>
    `;
    } else {
      priceDetails = `
      <div style="margin-bottom: 1rem;">
        <strong style="color: #3b82f6;">Price:</strong> 
        <span style="color: #999;">Not specified</span>
      </div>
    `;
    }

    const modalContent = `
    <div style="text-align: left;">
      <div style="margin-bottom: 1rem;">
        <strong style="color: #3b82f6;">Model:</strong> 
        <span style="color: #fff; font-size: 1.2rem;">${escapeHtml(fullModelName)}</span>
      </div>
      <div style="margin-bottom: 1rem;">
        <strong style="color: #3b82f6;">Manufacturer:</strong> 
        <span style="color: #ccc;">${escapeHtml(gpu.brand || "Unknown")}</span>
      </div>
      ${
        gpu.variant
          ? `
      <div style="margin-bottom: 1rem;">
        <strong style="color: #3b82f6;">Variant:</strong> 
        <span style="color: #ccc;">${escapeHtml(gpu.variant)}</span>
      </div>
      `
          : ""
      }
      ${priceDetails}
      <div style="margin-bottom: 1rem;">
        <strong style="color: #3b82f6;">Location:</strong> 
        <span style="color: #ccc;">${escapeHtml(gpu.location || "Not specified")}</span>
      </div>
      <div style="margin-bottom: 1rem;">
        <strong style="color: #3b82f6;">Seller:</strong> 
        <span style="color: #ccc;">${escapeHtml(gpu.author || "Unknown")}</span>
      </div>
      <div style="margin-bottom: 1rem;">
        <strong style="color: #3b82f6;">Title:</strong> 
        <div style="color: #ccc; margin-top: 0.5rem; padding: 0.5rem; background: rgba(0,0,0,0.3); border-radius: 5px;">
          ${escapeHtml(gpu.title)}
        </div>
      </div>
      <div style="margin-bottom: 1rem;">
        <strong style="color: #3b82f6;">Posted:</strong> 
        <span style="color: #ccc;">${gpu.forum_post_date ? formatDate(gpu.forum_post_date) : "Unknown"}</span>
      </div>
      <div style="margin-bottom: 1rem;">
        <strong style="color: #3b82f6;">Scraped:</strong> 
        <span style="color: #ccc;">${new Date(gpu.scraped_at).toLocaleString()}</span>
      </div>
      <div style="margin-top: 1.5rem; text-align: center;">
        <a href="${gpu.url}" target="_blank" class="btn btn-primary" style="text-decoration: none; padding: 0.75rem 2rem;">
          View on Forum →
        </a>
      </div>
    </div>
  `;

    Modal.show({
      type: "info",
      title: "GPU Listing Details",
      message: "",
      confirmText: "Close",
      confirmClass: "modal-btn-primary",
      onConfirm: () => {},
    });

    setTimeout(() => {
      document.getElementById("modalBody").innerHTML = modalContent;
      document.getElementById("modalCancel").style.display = "none";
    }, 10);
  };

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
        Modal.confirm(
          "Duplicate GPU Listings Found",
          `Total Listings: ${stats.totalListings}\nUnique Listings: ${stats.uniqueListings}\nDuplicate Listings: ${stats.totalDuplicates}\n\nRemove ${stats.totalDuplicates} duplicate listings?`,
          async () => {
            await removeDuplicates();
          },
        );
      } else {
        Toast.error("Error", "Failed to check duplicates");
      }
    } catch (error) {
      console.error("Error checking duplicates:", error);
      Toast.error("Error", "Failed to check duplicates");
    }
  };

  window.removeDuplicates = async function () {
    try {
      Toast.info("Processing", "Removing duplicate listings...", 3000);

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
        await loadAllData();
      } else {
        Toast.error("Failed", result.error || "Failed to remove duplicates");
      }
    } catch (error) {
      console.error("Error removing duplicates:", error);
      Toast.error("Error", "Failed to remove duplicates");
    }
  };

  window.clearDatabase = async function () {
    Modal.danger(
      "⚠️ Clear All GPU Data?",
      "This will permanently delete ALL GPU listings from the database. This action cannot be undone!",
      async () => {
        try {
          Toast.info("Processing", "Clearing database...", 3000);

          const response = await fetch("/api/gpu/clear-all", {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${Auth.getToken()}`,
              "Content-Type": "application/json",
            },
          });

          const result = await response.json();

          if (result.success) {
            Toast.success(
              "Database Cleared",
              "All GPU listings have been removed",
            );
            await loadAllData();
          } else {
            Toast.error("Failed", result.error || "Failed to clear database");
          }
        } catch (error) {
          console.error("Error clearing database:", error);
          Toast.error("Error", "Failed to clear database");
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
