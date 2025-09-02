        let ws = null;
        let logsVisible = false;

        // Initialize WebSocket connection
        function initWebSocket() {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            ws = new WebSocket(`${protocol}//${window.location.host}`);
            
            ws.onopen = function() {
                console.log('WebSocket connected');
                addLogEntry('WebSocket connected', 'info');
            };
            
            ws.onmessage = function(event) {
                const message = JSON.parse(event.data);
                handleWebSocketMessage(message);
            };
            
            ws.onclose = function() {
                console.log('WebSocket disconnected');
                addLogEntry('WebSocket disconnected', 'error');
                // Attempt to reconnect after 3 seconds
                setTimeout(initWebSocket, 3000);
            };
        }

        function handleWebSocketMessage(message) {
            switch(message.type) {
                case 'botStarted':
                    updateBotStatus(true);
                    addLogEntry('Bot started: ' + new Date(message.data.timestamp).toLocaleString(), 'info');
                    document.getElementById('emergencyStop').disabled = false;
                    break;
                case 'botCompleted':
                    updateBotStatus(false);
                    addLogEntry(`Bot completed: ${message.data.postsUpdated} posts updated, ${message.data.commentsAdded} comments added`, 'info');
                    document.getElementById('emergencyStop').disabled = true;
                    refreshStats();
                    break;
                case 'botStopped':
                    updateBotStatus(false);
                    addLogEntry('Bot stopped by user', 'info');
                    document.getElementById('emergencyStop').disabled = true;
                    refreshStats();
                    break;
                case 'botOutput':
                    addLogEntry(message.data, 'output');
                    break;
                case 'botError':
                    updateBotStatus(false);
                    addLogEntry('Bot error: ' + message.data.error, 'error');
                    document.getElementById('emergencyStop').disabled = true;
                    refreshStats();
                    break;
            }
        }

        function updateBotStatus(isRunning) {
            const statusElement = document.getElementById('botStatus');
            
            if (isRunning) {
                statusElement.textContent = 'Running';
                statusElement.className = 'status-indicator status-running';
            } else {
                statusElement.textContent = 'Idle';
                statusElement.className = 'status-indicator status-idle';
            }
        }

        function addLogEntry(message, type = 'output') {
            if (!logsVisible) return;
            
            const logContainer = document.getElementById('logContainer');
            const logEntry = document.createElement('div');
            logEntry.className = `log-entry ${type}`;
            logEntry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
            
            logContainer.appendChild(logEntry);
            
            // Keep only last 100 log entries
            while (logContainer.children.length > 100) {
                logContainer.removeChild(logContainer.firstChild);
            }
            
            // Auto scroll to bottom
            logContainer.scrollTop = logContainer.scrollHeight;
        }

        async function refreshStats() {
            try {
                const response = await fetch('/api/stats');
                const stats = await response.json();
                updateStatsDisplay(stats);
            } catch (error) {
                console.error('Error loading stats:', error);
            }
        }

        function updateStatsDisplay(stats) {
            document.getElementById('totalRuns').textContent = stats.totalRuns || 0;
            document.getElementById('postsUpdated').textContent = stats.totalPostsUpdated || 0;
            document.getElementById('commentsAdded').textContent = stats.totalCommentsAdded || 0;
            
            const lastRun = stats.lastRunDate ? new Date(stats.lastRunDate).toLocaleDateString() : 'Never';
            document.getElementById('lastRun').textContent = lastRun;
            document.getElementById('lastRunStatus').textContent = stats.lastRunStatus || 'Unknown';
            
            // Calculate success rate
            const totalRuns = stats.totalRuns || 0;
            const successfulRuns = stats.runHistory ? stats.runHistory.filter(run => run.status === 'completed').length : 0;
            const successRate = totalRuns > 0 ? Math.round((successfulRuns / totalRuns) * 100) : 0;
            document.getElementById('successRate').textContent = `${successRate}%`;
            
            // Update bot status
            updateBotStatus(stats.isRunning);
            
            // Update run history
            updateRunHistory(stats.runHistory || []);
        }

        function updateRunHistory(history) {
            const tbody = document.getElementById('historyTableBody');
            tbody.innerHTML = '';
            
            if (history.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #666;">No runs yet</td></tr>';
                return;
            }
            
            history.slice(0, 20).forEach(run => {
                const row = tbody.insertRow();
                const date = new Date(run.date).toLocaleString();
                
                row.innerHTML = `
                    <td>${date}</td>
                    <td><span class="status-indicator ${getStatusClass(run.status)}">${run.status}</span></td>
                    <td>${run.postsUpdated || 0}</td>
                    <td>${run.commentsAdded || 0}</td>
                    <td>-</td>
                `;
            });
        }

        function getStatusClass(status) {
            switch(status) {
                case 'completed': return 'status-idle';
                case 'running': return 'status-running';
                case 'error': return 'status-error';
                default: return 'status-idle';
            }
        }

        function toggleLogs() {
            logsVisible = !logsVisible;
            const logSection = document.getElementById('logSection');
            
            if (logsVisible) {
                logSection.classList.add('show');
                addLogEntry('Live logs enabled', 'info');
            } else {
                logSection.classList.remove('show');
            }
        }

        async function saveCredentials() {
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;
            
            if (!username || !password) {
                alert('Please enter both username and password');
                return;
            }
            
            try {
                const response = await fetch('/api/credentials', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    alert('Credentials saved successfully!');
                    // Clear password field for security
                    document.getElementById('password').value = '';
                } else {
                    alert('Failed to save credentials: ' + result.message);
                }
            } catch (error) {
                alert('Error saving credentials: ' + error.message);
            }
        }

        async function emergencyStop() {
            if (!confirm('Are you sure you want to stop the bot?')) {
                return;
            }
            
            try {
                const response = await fetch('/api/stop-bot', { method: 'POST' });
                const result = await response.json();
                
                if (result.success) {
                    addLogEntry('Emergency stop initiated', 'info');
                } else {
                    alert('Failed to stop bot: ' + result.message);
                }
            } catch (error) {
                alert('Error stopping bot: ' + error.message);
            }
        }

        // Initialize on page load
        document.addEventListener('DOMContentLoaded', function() {
            initWebSocket();
            refreshStats();
            
            // Auto-refresh stats every 30 seconds
            setInterval(refreshStats, 30000);
        });