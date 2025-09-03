// Dashboard page functionality
(function() {
    'use strict';
    
    let wsConnected = false;
    
    function init() {
        console.log('Dashboard initializing...');
        
        // Check authentication first
        if (!Auth.isAuthenticated()) {
            console.log('Not authenticated, redirecting to login');
            window.location.href = '/';
            return;
        }
        
        console.log('Authentication check passed');
        
        // Display user info
        const user = Auth.getUser();
        if (user && user.username) {
            console.log('Setting username:', user.username);
            const userNameElement = document.getElementById('userName');
            if (userNameElement) {
                userNameElement.textContent = user.username;
            }
        } else {
            console.error('No user data found');
            Auth.logout();
            return;
        }
        
        // Initialize WebSocket connection
        console.log('Initializing WebSocket...');
        WS.init(handleWebSocketMessage);
        
        // Load initial stats and credentials status
        console.log('Loading initial data...');
        loadStats();
        loadCredentialsStatus();
        
        // Auto-refresh stats every 30 seconds
        setInterval(loadStats, 30000);
        
        console.log('Dashboard initialization complete');
    }
    
    function handleWebSocketMessage(message) {
        console.log('WebSocket message:', message);
        
        switch(message.type) {
            case 'botStarted':
                updateBotStatus(true);
                UI.showMessage('Bot started successfully!', 'success');
                break;
            case 'botCompleted':
                updateBotStatus(false);
                loadStats(); // Refresh stats to show updated counts
                UI.showMessage(
                    `Bot completed: ${message.data.postsUpdated || 0} posts updated, ${message.data.commentsAdded || 0} comments added`, 
                    'success'
                );
                break;
            case 'botStopped':
                updateBotStatus(false);
                loadStats();
                UI.showMessage('Bot stopped successfully', 'success');
                break;
            case 'botError':
                updateBotStatus(false);
                loadStats();
                UI.showMessage('Bot encountered an error: ' + (message.data.error || 'Unknown error'), 'error');
                break;
            case 'statusUpdate':
                updateBotStatus(message.data.isRunning);
                break;
            case 'botOutput':
                console.log('Bot output:', message.data);
                break;
            case 'error':
                UI.showMessage(message.message || 'WebSocket error', 'error');
                break;
        }
    }
    
    function updateBotStatus(running) {
        const startButton = document.getElementById('startButton');
        const stopButton = document.getElementById('stopButton');
        const statusIndicator = document.getElementById('statusIndicator');
        
        if (running) {
            UI.updateButtonState('startButton', true, 'Bot Running...', 'Start Bot');
            stopButton.disabled = false;
            statusIndicator.style.display = 'block';
            statusIndicator.classList.add('running');
        } else {
            UI.updateButtonState('startButton', false, 'Bot Running...', 'Start Bot');
            stopButton.disabled = true;
            statusIndicator.style.display = 'none';
            statusIndicator.classList.remove('running');
        }
    }
    
    async function loadStats() {
        try {
            const result = await API.get('/api/stats');
            if (result && result.success && result.data) {
                updateStatsDisplay(result.data);
            } else {
                console.error('Failed to load stats:', result.error);
            }
        } catch (error) {
            console.error('Error loading stats:', error);
        }
    }
    
    async function loadCredentialsStatus() {
        try {
            const result = await API.get('/api/forum-credentials');
            if (result && result.success && result.data) {
                updateCredentialsDisplay(result.data);
            }
        } catch (error) {
            console.error('Error loading credentials status:', error);
        }
    }
    
    function updateCredentialsDisplay(credentialsData) {
        const credentialsSection = document.querySelector('.credentials-section');
        const statusText = credentialsSection.querySelector('p');
        
        if (credentialsData.hasCredentials) {
            statusText.textContent = `Forum credentials saved (last updated: ${new Date(credentialsData.lastUpdated).toLocaleDateString()})`;
            statusText.style.color = '#4caf50';
        } else {
            statusText.textContent = 'No forum credentials saved yet - please enter your forum login details';
            statusText.style.color = '#ff6b6b';
        }
    }
    
    function updateStatsDisplay(stats) {
        const formattedStats = Stats.formatStatsDisplay(stats);
        
        const quickStats = document.getElementById('quickStats');
        if (quickStats) {
            quickStats.innerHTML = `
                <div class="stat-card">
                    <h4>Total Runs</h4>
                    <div class="stat-value">${formattedStats.totalRuns}</div>
                </div>
                <div class="stat-card">
                    <h4>Posts Updated</h4>
                    <div class="stat-value">${formattedStats.totalPostsUpdated}</div>
                </div>
                <div class="stat-card">
                    <h4>Comments Added</h4>
                    <div class="stat-value">${formattedStats.totalCommentsAdded}</div>
                </div>
                <div class="stat-card">
                    <h4>Last Run</h4>
                    <div class="stat-value">${formattedStats.lastRun}</div>
                </div>
            `;
        }
        
        // Update bot status
        updateBotStatus(formattedStats.isRunning);
    }
    
    // Global functions for HTML onclick handlers
    window.saveCredentials = async function() {
        const forumUsername = document.getElementById('forumUsername').value.trim();
        const forumPassword = document.getElementById('forumPassword').value;
        
        if (!forumUsername || !forumPassword) {
            UI.showMessage('Please enter both forum username and password');
            return;
        }
        
        UI.showLoading(true);
        
        try {
            const result = await API.post('/api/forum-credentials', { 
                forumUsername, 
                forumPassword 
            });
            
            if (result && result.success) {
                UI.showMessage('Forum credentials saved successfully!', 'success');
                document.getElementById('forumPassword').value = '';
                loadCredentialsStatus(); // Refresh credentials status
            } else {
                UI.showMessage(result.error || 'Failed to save credentials');
            }
        } catch (error) {
            console.error('Error saving credentials:', error);
            UI.showMessage('Error saving credentials: ' + error.message);
        } finally {
            UI.showLoading(false);
        }
    };
    
    window.startBot = async function() {
        if (!confirm('Are you sure you want to start the bot? It will update your forum posts and add comments.')) {
            return;
        }
        
        UI.showLoading(true);
        
        try {
            const result = await API.post('/api/start-bot', {});
            
            if (result && result.success) {
                UI.showMessage('Bot started successfully!', 'success');
            } else {
                UI.showMessage(result.data?.message || result.error || 'Failed to start bot');
            }
        } catch (error) {
            console.error('Error starting bot:', error);
            UI.showMessage('Error starting bot: ' + error.message);
        } finally {
            UI.showLoading(false);
        }
    };
    
    window.stopBot = async function() {
        if (!confirm('Are you sure you want to stop the bot?')) {
            return;
        }
        
        UI.showLoading(true);
        
        try {
            const result = await API.post('/api/stop-bot', {});
            
            if (result && result.success) {
                UI.showMessage('Bot stopped successfully', 'success');
            } else {
                UI.showMessage(result.data?.message || result.error || 'Failed to stop bot');
            }
        } catch (error) {
            console.error('Error stopping bot:', error);
            UI.showMessage('Error stopping bot: ' + error.message);
        } finally {
            UI.showLoading(false);
        }
    };
    
    window.logout = function() {
        if (confirm('Are you sure you want to logout?')) {
            WS.close(); // Close WebSocket connection
            Auth.logout();
        }
    };
    
    // Initialize when DOM is loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();