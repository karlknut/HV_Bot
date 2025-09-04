// login.js - Fixed login page with real authentication
(function() {
    'use strict';

    function init() {
        // Initialize starfield animation
        new StarfieldAnimation();

        // Tab switching
        const tabs = document.querySelectorAll('.tab');
        const forms = document.querySelectorAll('.form');

        tabs.forEach((tab) => {
            tab.addEventListener('click', () => {
                const targetTab = tab.dataset.tab;

                // Update active states
                tabs.forEach((t) => t.classList.remove('active'));
                forms.forEach((f) => f.classList.remove('active'));

                tab.classList.add('active');
                document.querySelector(`form[data-tab="${targetTab}"]`).classList.add('active');

                // Clear any messages
                document.getElementById('message').style.display = 'none';
            });
        });

        // Login form handler
        document.getElementById('loginForm').addEventListener('submit', async (e) => {
            e.preventDefault();

            const username = document.getElementById('loginUsername').value.trim();
            const password = document.getElementById('loginPassword').value;

            if (!username || !password) {
                UI.showMessage('Please fill in all fields');
                return;
            }

            UI.showLoading(true);

            try {
                const response = await fetch('/api/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ username, password })
                });

                const result = await response.json();

                if (result.success) {
                    // Store auth data in localStorage
                    localStorage.setItem('hvbot_token', result.token);
                    localStorage.setItem('hvbot_user', JSON.stringify(result.user));
                    
                    UI.showMessage('Login successful! Redirecting...', 'success');
                    
                    // Redirect to dashboard after a short delay
                    setTimeout(() => {
                        window.location.href = '/dashboard';
                    }, 1000);
                } else {
                    // Check if it's invalid credentials
                    if (result.error === 'Invalid credentials') {
                        UI.showMessage('Invalid username or password. Please check your credentials or register if you don\'t have an account.', 'error');
                    } else {
                        UI.showMessage(result.error || 'Login failed. Please try again.', 'error');
                    }
                }
            } catch (error) {
                console.error('Login error:', error);
                UI.showMessage('Network error. Please check your connection and try again.', 'error');
            } finally {
                UI.showLoading(false);
            }
        });

        // Register form handler
        document.getElementById('registerForm').addEventListener('submit', async (e) => {
            e.preventDefault();

            const username = document.getElementById('registerUsername').value.trim();
            const password = document.getElementById('registerPassword').value;
            const confirmPassword = document.getElementById('confirmPassword').value;

            if (!username || !password || !confirmPassword) {
                UI.showMessage('Please fill in all fields');
                return;
            }

            if (password !== confirmPassword) {
                UI.showMessage('Passwords do not match');
                return;
            }

            if (password.length < 8) {
                UI.showMessage('Password must be at least 8 characters long');
                return;
            }

            UI.showLoading(true);

            try {
                const response = await fetch('/api/register', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ username, password })
                });

                const result = await response.json();

                if (result.success) {
                    UI.showMessage('Registration successful! You can now login.', 'success');

                    // Clear the form
                    document.getElementById('registerUsername').value = '';
                    document.getElementById('registerPassword').value = '';
                    document.getElementById('confirmPassword').value = '';

                    // Switch to login tab after successful registration
                    setTimeout(() => {
                        document.querySelector('.tab[data-tab="login"]').click();
                        document.getElementById('loginUsername').value = username;
                        document.getElementById('loginUsername').focus();
                    }, 1500);
                } else {
                    UI.showMessage(result.error || 'Registration failed. Please try again.', 'error');
                }
            } catch (error) {
                console.error('Registration error:', error);
                UI.showMessage('Network error. Please check your connection and try again.', 'error');
            } finally {
                UI.showLoading(false);
            }
        });
    }

    // Initialize when DOM is loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();