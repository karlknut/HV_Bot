// Dashboard page functionality
(function() {
    'use strict';
    
    let wsConnected = false;
    
    function init() {
        if (!Auth.isAuthenticated()) {
            Auth.redirectToLogin();
            return;
        }
        
        // Display user info
        const user = Auth.getUser();
        document.getElementById('userName').textContent = user.username;
        
        // Initialize WebSocket connection
        WS.init(handleWebSocketMessage);
        
        // Load initial stats
        loadStats();
        
        // Auto-refresh stats every 30 seconds
        setInterval(loadStats, 30000);
    }
    
    function handleWebSocketMessage(message) {
        switch(message.type) {
            case 'botStarted':
                updateBotStatus(true);
                UI.showMessage('Bot started successfully!', 'success');
                break;
            case 'botCompleted':
            case 'botStopped':
                updateBotStatus(false);
                loadStats();
                UI.showMessage(
                    `Bot completed: ${message.data.postsUpdated || 0} posts updated, ${message.data.commentsAdded || 0} comments added`, 
                    'success'
                );
                break;
            case 'botError':
                updateBotStatus(false);
                UI.showMessage('Bot encountered an error: ' + message.data.error, 'error');
                break;
            case 'statusUpdate':
                updateBotStatus(message.data.isRunning);
                break;
            case 'error':
                UI.showMessage(message.message, 'error');
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
            if (result && result.data) {
                updateStatsDisplay(result.data);
            }
        } catch (error) {
            console.error('Error loading stats:', error);
        }
    }
    
    function updateStatsDisplay(stats) {
        const formattedStats = Stats.formatStatsDisplay(stats);
        
        const quickStats = document.getElementById('quickStats');
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
        
        // Update bot status
        updateBotStatus(formattedStats.isRunning);
    }
    
    // Global functions for HTML onclick handlers
    window.saveCredentials = async function() {
        const forumUsername = document.getElementById('forumUsername').value;
        const forumPassword = document.getElementById('forumPassword').value;
        
        if (!forumUsername || !forumPassword) {
            UI.showMessage('Please enter both forum username and password');
            return;
        }
        
        try {
            const result = await API.post('/api/forum-credentials', { 
                forumUsername, 
                forumPassword 
            });
            
            if (result && result.data) {
                if (result.data.success) {
                    UI.showMessage('Forum credentials saved successfully!', 'success');
                    document.getElementById('forumPassword').value = '';
                } else {
                    UI.showMessage(result.data.error || 'Failed to save credentials');
                }
            }
        } catch (error) {
            console.error('Error saving credentials:', error);
            UI.showMessage('Error saving credentials: ' + error.message);
        }
    };
    
    window.startBot = async function() {
        try {
            const result = await API.post('/api/start-bot', {});
            
            if (result && result.data && !result.data.success) {
                UI.showMessage(result.data.message);
            }
        } catch (error) {
            console.error('Error starting bot:', error);
            UI.showMessage('Error starting bot: ' + error.message);
        }
    };
    
    window.stopBot = async function() {
        if (!confirm('Are you sure you want to stop the bot?')) {
            return;
        }
        
        try {
            const result = await API.post('/api/stop-bot', {});
            
            if (result && result.data) {
                if (result.data.success) {
                    UI.showMessage('Bot stopped successfully', 'success');
                } else {
                    UI.showMessage(result.data.message);
                }
            }
        } catch (error) {
            console.error('Error stopping bot:', error);
            UI.showMessage('Error stopping bot: ' + error.message);
        }
    };
    
    // Initialize when DOM is loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();