// gpu-tracker.js - Frontend JavaScript for GPU Price Tracker

(function() {
  'use strict';

  let gpuListings = [];
  let sortColumn = 'date';
  let sortOrder = 'desc';
  let filtersVisible = false;

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
    document.getElementById("logoutBtn").addEventListener("click", handleLogout);
  }

  function handleWebSocketMessage(message) {
    if (message.type === "gpuScanUpdate") {
      updateProgress(message.data);
    }
  }

  function updateProgress(message) {
    const progressText = document.getElementById("progressText");
    if (progressText) {
      progressText.textContent = message;
    }
  }

  async function startGPUScan() {
    const scanButton = document.getElementById("scanButton");
    const scanProgress = document.getElementById("scanProgress");
    
    scanButton.disabled = true;
    scanProgress.style.display = "block";
    
    try {
      const response = await API.post("/api/gpu/scan", {});
      
      if (response.success) {
        Toast.success("Scan Complete", `Found ${response.data.totalListings} GPU listings`);
        loadListings();
      } else {
        Toast.error("Scan Failed", response.error || "Failed to scan forum");
      }
    } catch (error) {
      Toast.error("Error", "Failed to start GPU scan");
    } finally {
      scanButton.disabled = false;
      scanProgress.style.display = "none";
    }
  }

  async function loadListings() {
    try {
      const filters = getFilters();
      const response = await API.get(`/api/gpu/listings?${new URLSearchParams(filters)}`);
      
      if (response.success) {
        gpuListings = response.data;
        updateTable();
        updateStats();
      }
    } catch (error) {
      console.error("Error loading listings:", error);
    }
  }

  function getFilters() {
    return {
      model: document.getElementById("modelFilter")?.value || '',
      minPrice: document.getElementById("minPriceFilter")?.value || '',
      maxPrice: document.getElementById("maxPriceFilter")?.value || '',
      currency: document.getElementById("currencyFilter")?.value || ''
    };
  }

  function updateTable() {
    const tbody = document.getElementById("gpuTableBody");
    
    if (gpuListings.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="table-empty">No listings found</td></tr>';
      return;
    }
    
    // Sort listings
    const sorted = [...gpuListings].sort((a, b) => {
      let aVal = a[sortColumn];
      let bVal = b[sortColumn];
      
      if (sortColumn === 'price') {
        aVal = parseFloat(aVal) || 0;
        bVal = parseFloat(bVal) || 0;
      }
      
      if (sortOrder === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });
    
    tbody.innerHTML = sorted.map(gpu => `
      <tr>
        <td class="gpu-model">${gpu.model || 'Unknown'}</td>
        <td class="gpu-price">${gpu.price}</td>
        <td class="gpu-currency">${gpu.currency}</td>
        <td class="gpu-title" title="${escapeHtml(gpu.title)}">${truncate(gpu.title, 50)}</td>
        <td class="gpu-author">${gpu.author}</td>
        <td class="gpu-date">${formatDate(gpu.scraped_at)}</td>
        <td class="gpu-actions">
          <button class="btn-small" onclick="viewGPUDetails('${gpu.id}')">View</button>
          <a href="${gpu.url}" target="_blank" class="btn-small">Forum</a>
        </td>
      </tr>
    `).join('');
  }

  function updateStats() {
    const totalListings = gpuListings.length;
    const prices = gpuListings.map(g => parseFloat(g.price)).filter(p => !isNaN(p));
    const avgPrice = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;
    const lowestPrice = prices.length > 0 ? Math.min(...prices) : 0;
    
    document.getElementById("totalListings").textContent = totalListings;
    document.getElementById("avgPrice").textContent = `€${avgPrice.toFixed(0)}`;
    document.getElementById("lowestPrice").textContent = `€${lowestPrice}`;
    
    // Update last scan time
    if (gpuListings.length > 0) {
      const lastScan = new Date(Math.max(...gpuListings.map(g => new Date(g.scraped_at))));
      document.getElementById("lastScan").textContent = formatTimeAgo(lastScan);
    }
  }

  function viewGPUDetails(id) {
    const gpu = gpuListings.find(g => g.id === id);
    if (!gpu) return;
    
    const modalContent = `
      <div style="text-align: left;">
        <div style="margin-bottom: 1rem;">
          <strong style="color: #3b82f6;">Model:</strong> 
          <span style="color: #ccc;">${gpu.author}</span>
        </div>
        <div style="margin-bottom: 1rem;">
          <strong style="color: #3b82f6;">Listed:</strong> 
          <span style="color: #ccc;">${formatDate(gpu.scraped_at)}</span>
        </div>
        <div style="margin-top: 1.5rem;">
          <a href="${gpu.url}" target="_blank" class="btn btn-primary">
            View on Forum
          </a>
        </div>
      </div>
    `;
    
    Modal.show({
      type: 'alert',
      title: 'GPU Listing Details',
      message: '',
      confirmText: 'Close',
      confirmClass: 'modal-btn-secondary',
      onConfirm: () => {}
    });
    
    setTimeout(() => {
      document.getElementById('modalBody').innerHTML = modalContent;
      document.getElementById('modalIcon').style.display = 'none';
    }, 10);
  }

  window.sortTable = function(column) {
    if (sortColumn === column) {
      sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      sortColumn = column;
      sortOrder = 'asc';
    }
    updateTable();
  };

  window.toggleFilters = function() {
    const filtersSection = document.getElementById('filtersSection');
    filtersVisible = !filtersVisible;
    filtersSection.style.display = filtersVisible ? 'block' : 'none';
  };

  window.applyFilters = function() {
    loadListings();
  };

  window.refreshListings = function() {
    Toast.info('Refreshing', 'Loading latest listings...');
    loadListings();
  };

  window.startGPUScan = startGPUScan;
  window.viewGPUDetails = viewGPUDetails;

  function handleLogout() {
    Modal.danger(
      "Logout?",
      "Are you sure you want to logout?",
      () => {
        WS.close();
        Auth.logout();
      }
    );
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function truncate(text, length) {
    return text.length > length ? text.substring(0, length) + '...' : text;
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
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();