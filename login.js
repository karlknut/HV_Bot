(function() {
    'use strict';
    
    let currentTab = 'login';

    function init() {
        // Check if user is already logged in
        if (localStorage.getItem('token')) {
            window.location.href = '/dashboard';
            return;
        }
        
        // Set up event listeners
        setupEventListeners();
    }
    
    function setupEventListeners() {
        // Form submissions
        document.getElementById('loginForm').addEventListener('submit', handleLogin);
        document.getElementById('registerForm').addEventListener('submit', handleRegister);
    }

    window.switchTab = function(tab) {
        currentTab = tab;
        
        // Update tab buttons
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        event.target.classList.add('active');
        
        // Update forms
        document.querySelectorAll('.form').forEach(f => f.classList.remove('active'));
        document.getElementById(tab + 'Form').classList.add('active');
        
        // Clear messages
        hideMessage();
    };

    function showMessage(text, type = 'error') {
        const messageEl = document.getElementById('message');
        messageEl.textContent = text;
        messageEl.className = `message ${type}`;
        messageEl.style.display = 'block';
    }

    function hideMessage() {
        document.getElementById('message').style.display = 'none';
    }

    function showLoading(show = true) {
        document.getElementById('loading').style.display = show ? 'block' : 'none';
        document.querySelectorAll('.btn').forEach(btn => btn.disabled = show);
    }

    async function handleLogin(e) {
        e.preventDefault();
        
        const username = document.getElementById('loginUsername').value;
        const password = document.getElementById('loginPassword').value;
        
        if (!username || !password) {
            showMessage('Please fill in all fields');
            return;
        }

        showLoading(true);
        hideMessage();

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const result = await response.json();

            if (result.success) {
                // Store token and redirect
                localStorage.setItem('token', result.token);
                localStorage.setItem('user', JSON.stringify(result.user));
                
                showMessage('Login successful! Redirecting...', 'success');
                
                setTimeout(() => {
                    window.location.href = '/dashboard';
                }, 1000);
            } else {
                showMessage(result.error || 'Login failed');
            }
        } catch (error) {
            console.error('Login error:', error);
            showMessage('Network error. Please try again.');
        }

        showLoading(false);
    }

    async function handleRegister(e) {
        e.preventDefault();
        
        const username = document.getElementById('registerUsername').value;
        const password = document.getElementById('registerPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        
        if (!username || !password || !confirmPassword) {
            showMessage('Please fill in all fields');
            return;
        }

        if (password !== confirmPassword) {
            showMessage('Passwords do not match');
            return;
        }

        if (password.length < 8) {
            showMessage('Password must be at least 8 characters long');
            return;
        }

        showLoading(true);
        hideMessage();

        try {
            const response = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const result = await response.json();

            if (result.success) {
                showMessage('Registration successful! You can now login.', 'success');
                
                // Switch to login tab after successful registration
                setTimeout(() => {
                    // Simulate clicking the login tab
                    const loginTab = document.querySelector('.tab');
                    const event = { target: loginTab };
                    switchTab('login');
                    document.getElementById('loginUsername').value = username;
                }, 1500);
            } else {
                showMessage(result.error || 'Registration failed');
            }
        } catch (error) {
            console.error('Registration error:', error);
            showMessage('Network error. Please try again.');
        }

        showLoading(false);
    }

    // Initialize when DOM is loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();