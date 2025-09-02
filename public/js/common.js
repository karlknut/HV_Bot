// Starfield Animation
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
        
        // Handle resize
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

// Authentication utilities
class Auth {
    static getToken() {
        return localStorage.getItem('token');
    }
    
    static getUser() {
        const userData = localStorage.getItem('user');
        return userData ? JSON.parse(userData) : null;
    }
    
    static setAuth(token, user) {
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user));
    }
    
    static clearAuth() {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
    }
    
    static isAuthenticated() {
        return !!this.getToken();
    }
    
    static checkAuth() {
        if (!this.isAuthenticated()) {
            window.location.href = '/';
            return false;
        }
        return true;
    }
    
    static logout() {
        this.clearAuth();
        window.location.href = '/';
    }
}

// API utilities
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
            
            // Handle auth errors
            if (response.status === 401 || response.status === 403) {
                Auth.logout();
                return null;
            }
            
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('API request error:', error);
            throw error;
        }
    }
    
    static get(url) {
        return this.request(url, { method: 'GET' });
    }
    
    static post(url, data) {
        return this.request(url, {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }
}

// WebSocket Manager
class WebSocketManager {
    constructor(onMessage) {
        this.ws = null;
        this.onMessage = onMessage;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectDelay = 3000;
        this.isIntentionallyClosed = false;
    }
    
    connect() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        this.ws = new WebSocket(`${protocol}//${window.location.host}`);
        
        this.ws.onopen = () => {
            console.log('WebSocket connected');
            this.reconnectAttempts = 0;
            
            // Authenticate the connection
            const token = Auth.getToken();
            if (token) {
                this.send({ type: 'auth', token });
            }
        };
        
        this.ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                if (this.onMessage) {
                    this.onMessage(message);
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
    
    send(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        }
    }
    
    close() {
        this.isIntentionallyClosed = true;
        if (this.ws) {
            this.ws.close();
        }
    }
}

// UI Utilities
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
        
        // Disable all submit buttons while loading
        document.querySelectorAll('button[type="submit"], .btn').forEach(btn => {
            btn.disabled = show;
        });
    }
    
    static formatDate(dateString) {
        if (!dateString) return 'Never';
        const date = new Date(dateString);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    }
}

// Initialize starfield on DOM load
document.addEventListener('DOMContentLoaded', () => {
    new StarfieldAnimation();
});