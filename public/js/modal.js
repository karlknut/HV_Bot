// modal.js - Custom Modal and Toast Notification System

// Modal System
class Modal {
  static show(options) {
    const overlay = document.getElementById("modalOverlay");
    const icon = document.getElementById("modalIcon");
    const iconSymbol = document.getElementById("modalIconSymbol");
    const title = document.getElementById("modalTitle");
    const body = document.getElementById("modalBody");
    const confirmBtn = document.getElementById("modalConfirm");
    const cancelBtn = document.getElementById("modalCancel");

    // Set content
    title.textContent = options.title || "Confirmation";
    body.textContent = options.message || "Are you sure?";

    // Set icon
    icon.className = `modal-icon ${options.type || "confirm"}`;
    const icons = {
      confirm: "?",
      success: "✓",
      warning: "⚠",
      error: "✕",
      info: "i",
    };
    iconSymbol.textContent = icons[options.type] || icons.confirm;

    // Set buttons
    if (options.confirmText) confirmBtn.textContent = options.confirmText;
    if (options.cancelText) cancelBtn.textContent = options.cancelText;
    if (options.confirmClass)
      confirmBtn.className = `modal-btn ${options.confirmClass}`;

    // Clear previous listeners
    const newConfirm = confirmBtn.cloneNode(true);
    const newCancel = cancelBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirm, confirmBtn);
    cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);

    // Add listeners
    newConfirm.addEventListener("click", () => {
      overlay.classList.remove("show");
      if (options.onConfirm) options.onConfirm();
    });

    newCancel.addEventListener("click", () => {
      overlay.classList.remove("show");
      if (options.onCancel) options.onCancel();
    });

    // Show only confirm for alerts
    if (options.type === "alert") {
      newCancel.style.display = "none";
    } else {
      newCancel.style.display = "block";
    }

    // Show modal
    overlay.classList.add("show");
  }

  static confirm(title, message, onConfirm, onCancel) {
    this.show({
      type: "confirm",
      title,
      message,
      onConfirm,
      onCancel,
      confirmText: "Confirm",
      cancelText: "Cancel",
      confirmClass: "modal-btn-primary",
    });
  }

  static danger(title, message, onConfirm, onCancel) {
    this.show({
      type: "warning",
      title,
      message,
      onConfirm,
      onCancel,
      confirmText: "Proceed",
      cancelText: "Cancel",
      confirmClass: "modal-btn-danger",
    });
  }

  static alert(title, message, onClose) {
    this.show({
      type: "alert",
      title,
      message,
      onConfirm: onClose,
      confirmText: "OK",
      confirmClass: "modal-btn-primary",
    });
  }

  static success(title, message, onClose) {
    this.show({
      type: "success",
      title,
      message,
      onConfirm: onClose,
      confirmText: "OK",
      confirmClass: "modal-btn-primary",
    });
  }

  static error(title, message, onClose) {
    this.show({
      type: "error",
      title,
      message,
      onConfirm: onClose,
      confirmText: "OK",
      confirmClass: "modal-btn-danger",
    });
  }
}

// Toast Notification System
class Toast {
  static activeToasts = [];
  static toastOffset = 80;
  static toastSpacing = 10;

  static show(type, title, message, duration = 4000) {
    const toast = document.getElementById("notificationToast");

    // Clone the toast for multiple notifications
    const newToast = toast.cloneNode(true);
    newToast.id = "toast-" + Date.now();
    document.body.appendChild(newToast);

    const icon = newToast.querySelector(".notification-icon");
    const iconSymbol = newToast.querySelector(".notification-icon span");
    const toastTitle = newToast.querySelector(".notification-title");
    const toastMessage = newToast.querySelector(".notification-message");
    const closeBtn = newToast.querySelector(".notification-close");

    // Set content
    toastTitle.textContent = title;
    toastMessage.textContent = message;

    // Set icon based on type
    const icons = {
      success: "✓",
      error: "✕",
      warning: "⚠",
      info: "i",
    };

    const colors = {
      success: "#10b981",
      error: "#ef4444",
      warning: "#f59e0b",
      info: "#3b82f6",
    };

    iconSymbol.textContent = icons[type] || icons.info;
    icon.style.background = `linear-gradient(135deg, ${colors[type]}33 0%, ${colors[type]}22 100%)`;
    icon.style.border = `2px solid ${colors[type]}`;
    icon.style.color = colors[type];

    // Calculate position for stacking
    const topPosition =
      this.toastOffset + this.activeToasts.length * (60 + this.toastSpacing);
    newToast.style.top = topPosition + "px";

    // Add to active toasts
    this.activeToasts.push(newToast);

    // Show toast
    setTimeout(() => {
      newToast.classList.add("show");
    }, 10);

    // Auto hide
    const hideTimer = setTimeout(() => {
      this.hideToast(newToast);
    }, duration);

    // Close button
    closeBtn.onclick = () => {
      clearTimeout(hideTimer);
      this.hideToast(newToast);
    };
  }

  static hideToast(toast) {
    toast.classList.remove("show");

    setTimeout(() => {
      // Remove from active toasts
      const index = this.activeToasts.indexOf(toast);
      if (index > -1) {
        this.activeToasts.splice(index, 1);

        // Reposition remaining toasts
        this.activeToasts.forEach((t, i) => {
          const topPosition = this.toastOffset + i * (60 + this.toastSpacing);
          t.style.top = topPosition + "px";
        });
      }

      // Remove from DOM
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 400);
  }

  static success(title, message, duration) {
    this.show("success", title, message, duration);
  }

  static error(title, message, duration) {
    this.show("error", title, message, duration);
  }

  static warning(title, message, duration) {
    this.show("warning", title, message, duration);
  }

  static info(title, message, duration) {
    this.show("info", title, message, duration);
  }
}

// Make globally available
window.Modal = Modal;
window.Toast = Toast;
