// Common JavaScript functionality
class StarfieldAnimation {
    constructor(canvasId = 'starfield') {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        
        this.ctx = this.canvas.getContext('2d');
        this.stars = [];
        this.numStars = window.innerWidth < 768 ? 1000 : 2500;
        this.speed = 0.4;
        
        this.init();
        this.animate();
        
        window.addEventListener('resize', () => this.handleResize());
    }
    
    init() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        
        this.stars = [];
        for (let i = 0; i < this.numStars; i++) {
            this.stars.push({
                x: (Math.random() - 0.5) * this.canvas.width,
                y: (Math.random() - 0.5) * this.canvas.height,
                z: Math.random() * this.canvas.width
            });
        }
    }
    
    animate() {
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        for (let i = 0; i < this.numStars; i++) {
            let star = this.stars[i];
            star.z -= this.speed;
            
            if (star.z <= 0) {
                star.x = (Math.random() - 0.5) * this.canvas.width;
                star.y = (Math.random() - 0.5) * this.canvas.height;
                star.z = this.canvas.width;
            }
            
            let k = 128.0 / star.z;
            let x = star.x * k + this.canvas.width / 2;
            let y = star.y * k + this.canvas.height / 2;
            
            if (x < 0 || x >= this.canvas.width || y < 0 || y >= this.canvas.height) continue;
            
            let size = (1 - star.z / this.canvas.width) * 2.5;
            let shade = 255 - Math.floor(star.z / this.canvas.width * 200);
            
            this.ctx.fillStyle = `rgba(${shade}, ${shade}, ${shade}, 0.6)`;
            this.ctx.beginPath();
            this.ctx.arc(x, y, size, 0, Math.PI * 2);
            this.ctx.fill();
        }
        
        requestAnimationFrame(() => this.animate());
    }
    
    handleResize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.init();
    }
}

// Enhanced Authentication utilities
class Auth {
    static getToken() {
        return localStorage.getItem('hvbot_token');
    }
    
    static getUser() {
        const userData = localStorage.getItem('hvbot_user');
        try {
            return userData ? JSON.parse(userData) : null;
        } catch (error) {
            console.error('Error parsing user data:', error);
            localStorage.removeItem('hvbot_user');
            return null;
        }
    }
    
    static setAuth(token, user) {
        console.log('Setting auth - Token:', token ? 'Present' : 'Missing', 'User:', user);
        localStorage.setItem('hvbot_token', token);
        localStorage.setItem('hvbot_user', JSON.stringify(user));
    }
    
    static clearAuth() {
        console.log('Clearing authentication data');
        localStorage.removeItem('hvbot_token');
        localStorage.removeItem('hvbot_user');
    }
    
    static isAuthenticated() {
        const token = this.getToken();
        console.log('Checking authentication - Token present:', !!token);
        
        if (!token) {
            console.log('No token found');
            return false;
        }
        
        try {
            // Split JWT token and decode payload
            const parts = token.split('.');
            if (parts.length !== 3) {
                console.log('Invalid token format');
                this.clearAuth();
                return false;
            }
            
            const payload = JSON.parse(atob(parts[1]));
            const currentTime = Date.now() / 1000;
            const isValid = payload.exp > currentTime;
            
            console.log('Token validation - Expires:', new Date(payload.exp * 1000), 'Valid:', isValid);
            
            if (!isValid) {
                console.log('Token expired, clearing auth');
                this.clearAuth();
                return false;
            }
            
            return true;
        } catch (error) {
            console.error('Token validation error:', error);
            this.clearAuth();
            return false;
        }
    }
    
    static checkAuth() {
        console.log('Checking authentication status');
        const isAuth = this.isAuthenticated();
        
        if (!isAuth) {
            console.log('Not authenticated, redirecting to login');
            this.redirectToLogin();
            return false;
        }
        
        console.log('Authentication check passed');
        return true;
    }
    
    static logout() {
        console.log('Logging out user');
        this.clearAuth();
        this.redirectToLogin();
    }
    
    static redirectToLogin() {
        console.log('Redirecting to login page');
        window.location.href = '/';
    }
}

// Enhanced API utilities
class API {
    static async request(url, options = {}) {
        const token = Auth.getToken();
        
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json',
                ...(token && { 'Authorization': `Bearer ${token}` })
            }
        };
        
        const finalOptions = {
            ...defaultOptions,
            ...options,
            headers: {
                ...defaultOptions.headers,
                ...options.headers
            }
        };
        
        try {
            const response = await fetch(url, finalOptions);
            
            if (response.status === 401 || response.status === 403) {
                Auth.logout();
                return { error: 'Authentication required' };
            }
            
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                throw new Error('Server returned non-JSON response');
            }
            
            const data = await response.json();
            return { success: response.ok, data, status: response.status };
        } catch (error) {
            console.error('API request error:', error);
            return { success: false, error: error.message };
        }
    }
    
    static async get(url) {
        return this.request(url, { method: 'GET' });
    }
    
    static async post(url, data) {
        return this.request(url, {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }
}

// Enhanced WebSocket Manager
class WS {
    static ws = null;
    static reconnectAttempts = 0;
    static maxReconnectAttempts = 10;
    static reconnectDelay = 3000;
    static isIntentionallyClosed = false;
    static messageHandler = null;

    static init(onMessage) {
        this.messageHandler = onMessage;
        this.connect();
    }
    
    static connect() {
        if (!Auth.isAuthenticated()) return;
        
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        this.ws = new WebSocket(`${protocol}//${window.location.host}`);
        
        this.ws.onopen = () => {
            console.log('WebSocket connected');
            this.reconnectAttempts = 0;
            
            const token = Auth.getToken();
            if (token) {
                this.send({ type: 'auth', token });
            }
        };
        
        this.ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                if (this.messageHandler) {
                    this.messageHandler(message);
                }
            } catch (error) {
                console.error('WebSocket message parse error:', error);
            }
        };
        
        this.ws.onclose = () => {
            console.log('WebSocket disconnected');
            
            if (!this.isIntentionallyClosed && this.reconnectAttempts < this.maxReconnectAttempts) {
                this.reconnectAttempts++;
                console.log(`Reconnecting... (attempt ${this.reconnectAttempts})`);
                setTimeout(() => this.connect(), this.reconnectDelay);
            }
        };
        
        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
    }
    
    static send(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        }
    }
    
    static close() {
        this.isIntentionallyClosed = true;
        if (this.ws) {
            this.ws.close();
        }
    }
}

// Enhanced UI Utilities
class UI {
    static showMessage(message, type = 'error', elementId = 'message') {
        const messageEl = document.getElementById(elementId);
        if (!messageEl) return;
        
        messageEl.textContent = message;
        messageEl.className = `message ${type}`;
        messageEl.style.display = 'block';
        
        setTimeout(() => {
            messageEl.style.display = 'none';
        }, 5000);
    }
    
    static showLoading(show = true, elementId = 'loading') {
        const loadingEl = document.getElementById(elementId);
        if (loadingEl) {
            loadingEl.style.display = show ? 'block' : 'none';
        }
        
        document.querySelectorAll('button[type="submit"], .btn, .control-button, .save-button').forEach(btn => {
            btn.disabled = show;
        });
    }
    
    static updateButtonState(buttonId, disabled, disabledText, enabledText) {
        const button = document.getElementById(buttonId);
        if (button) {
            button.disabled = disabled;
            const span = button.querySelector('span') || button;
            span.textContent = disabled ? disabledText : enabledText;
        }
    }
    
    static formatDate(dateString) {
        if (!dateString) return 'Never';
        const date = new Date(dateString);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    }
    
    static showRefreshIndicator(elementId = 'refreshIndicator') {
        const indicator = document.getElementById(elementId) || this.createRefreshIndicator();
        indicator.classList.add('show');
        setTimeout(() => indicator.classList.remove('show'), 2000);
    }
    
    static createRefreshIndicator() {
        const indicator = document.createElement('span');
        indicator.id = 'refreshIndicator';
        indicator.className = 'refresh-indicator';
        indicator.textContent = '✓ Updated';
        document.body.appendChild(indicator);
        return indicator;
    }
}

// Statistics utilities
class Stats {
    static formatStatsDisplay(stats) {
        return {
            totalRuns: stats.totalRuns || 0,
            totalPostsUpdated: stats.totalPostsUpdated || 0,
            totalCommentsAdded: stats.totalCommentsAdded || 0,
            lastRun: stats.lastRunDate ? this.formatShortDate(stats.lastRunDate) : 'Never',
            lastRunStatus: stats.lastRunStatus || 'Unknown',
            isRunning: stats.isRunning || false
        };
    }
    
    static formatShortDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString();
    }
}

// Initialize starfield on DOM load
document.addEventListener('DOMContentLoaded', () => {
    new StarfieldAnimation();
});