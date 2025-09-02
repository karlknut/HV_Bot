const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const fs = require('fs').promises;
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Configuration
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32);
const USERS_FILE = path.join(__dirname, 'users.json');
const STATS_DIR = path.join(__dirname, 'user_stats');

// Store active connections and bot states per user
let wsConnections = new Map(); // userId -> Set of WebSocket connections
let botStates = new Map(); // userId -> { isRunning: boolean, process: null }

// Middleware
app.use(express.json());
app.use(express.static(__dirname));

// Encryption utilities
function encrypt(text) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher('aes-256-cbc', ENCRYPTION_KEY);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
}

function decrypt(encryptedText) {
    const [ivHex, encrypted] = encryptedText.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipher('aes-256-cbc', ENCRYPTION_KEY);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

// Authentication middleware
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token' });
        }
        req.user = user;
        next();
    });
}

// User management functions
async function loadUsers() {
    try {
        const data = await fs.readFile(USERS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return {};
    }
}

async function saveUsers(users) {
    await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2));
}

async function ensureStatsDir() {
    try {
        await fs.access(STATS_DIR);
    } catch {
        await fs.mkdir(STATS_DIR, { recursive: true });
    }
}

async function loadUserStats(userId) {
    try {
        const statsFile = path.join(STATS_DIR, `${userId}.json`);
        const data = await fs.readFile(statsFile, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return {
            totalRuns: 0,
            totalPostsUpdated: 0,
            totalCommentsAdded: 0,
            lastRunDate: null,
            lastRunStatus: 'never_run',
            runHistory: []
        };
    }
}

async function saveUserStats(userId, stats) {
    await ensureStatsDir();
    const statsFile = path.join(STATS_DIR, `${userId}.json`);
    await fs.writeFile(statsFile, JSON.stringify(stats, null, 2));
}

// Serve pages
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard.html'));
});

app.get('/status', (req, res) => {
    res.sendFile(path.join(__dirname, 'user_status.html'));
});

// Authentication routes
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }

        if (password.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters' });
        }

        const users = await loadUsers();
        
        if (users[username]) {
            return res.status(400).json({ error: 'Username already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        users[username] = {
            id: crypto.randomBytes(16).toString('hex'),
            username,
            password: hashedPassword,
            createdAt: new Date().toISOString(),
            forumCredentials: null
        };

        await saveUsers(users);
        
        res.json({ success: true, message: 'User registered successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Registration failed: ' + error.message });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        const users = await loadUsers();
        const user = users[username];
        
        if (!user || !await bcrypt.compare(password, user.password)) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { userId: user.id, username: user.username }, 
            JWT_SECRET, 
            { expiresIn: '24h' }
        );

        res.json({ 
            success: true, 
            token, 
            user: { id: user.id, username: user.username }
        });
    } catch (error) {
        res.status(500).json({ error: 'Login failed: ' + error.message });
    }
});

// Protected API routes
app.get('/api/stats', authenticateToken, async (req, res) => {
    try {
        const stats = await loadUserStats(req.user.userId);
        const botState = botStates.get(req.user.userId) || { isRunning: false };
        stats.isRunning = botState.isRunning;
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: 'Failed to load stats' });
    }
});

app.post('/api/forum-credentials', authenticateToken, async (req, res) => {
    try {
        const { forumUsername, forumPassword } = req.body;
        
        if (!forumUsername || !forumPassword) {
            return res.status(400).json({ error: 'Forum username and password required' });
        }

        const users = await loadUsers();
        const user = users[req.user.username];
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Encrypt forum credentials
        user.forumCredentials = {
            username: encrypt(forumUsername),
            password: encrypt(forumPassword),
            updatedAt: new Date().toISOString()
        };

        await saveUsers(users);
        
        res.json({ success: true, message: 'Forum credentials saved successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to save credentials: ' + error.message });
    }
});

app.post('/api/start-bot', authenticateToken, async (req, res) => {
    const userId = req.user.userId;
    const botState = botStates.get(userId) || { isRunning: false, process: null };
    
    if (botState.isRunning) {
        return res.json({ success: false, message: 'Bot is already running' });
    }

    try {
        const users = await loadUsers();
        const user = users[req.user.username];
        
        if (!user || !user.forumCredentials) {
            return res.json({ 
                success: false, 
                message: 'Forum credentials not found. Please set them first.' 
            });
        }

        // Decrypt credentials
        const forumUsername = decrypt(user.forumCredentials.username);
        const forumPassword = decrypt(user.forumCredentials.password);

        botState.isRunning = true;
        botStates.set(userId, botState);
        
        // Update user stats
        const stats = await loadUserStats(userId);
        stats.totalRuns += 1;
        stats.lastRunDate = new Date().toISOString();
        stats.lastRunStatus = 'running';
        await saveUserStats(userId, stats);

        // Broadcast to user's connections
        broadcastToUser(userId, {
            type: 'botStarted',
            data: { timestamp: new Date().toISOString() }
        });

        // Start bot for this user
        runBotForUser(userId, forumUsername, forumPassword);
        
        res.json({ success: true, message: 'Bot started successfully' });
    } catch (error) {
        const botState = botStates.get(userId);
        if (botState) {
            botState.isRunning = false;
            botStates.set(userId, botState);
        }
        res.status(500).json({ success: false, message: 'Failed to start bot: ' + error.message });
    }
});

app.post('/api/stop-bot', authenticateToken, async (req, res) => {
    const userId = req.user.userId;
    const botState = botStates.get(userId);
    
    if (!botState || !botState.isRunning) {
        return res.json({ success: false, message: 'Bot is not running' });
    }

    try {
        if (botState.process) {
            botState.process.kill('SIGTERM');
        }
        
        botState.isRunning = false;
        botStates.set(userId, botState);
        
        // Update stats
        const stats = await loadUserStats(userId);
        stats.lastRunStatus = 'stopped';
        await saveUserStats(userId, stats);

        broadcastToUser(userId, {
            type: 'botStopped',
            data: { timestamp: new Date().toISOString() }
        });

        res.json({ success: true, message: 'Bot stopped successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to stop bot: ' + error.message });
    }
});

// WebSocket handling with authentication
wss.on('connection', (ws, req) => {
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            if (data.type === 'auth' && data.token) {
                jwt.verify(data.token, JWT_SECRET, (err, user) => {
                    if (err) {
                        ws.send(JSON.stringify({ type: 'error', message: 'Invalid token' }));
                        ws.close();
                        return;
                    }
                    
                    ws.userId = user.userId;
                    
                    // Add to user's connection set
                    if (!wsConnections.has(user.userId)) {
                        wsConnections.set(user.userId, new Set());
                    }
                    wsConnections.get(user.userId).add(ws);
                    
                    // Send current bot status
                    const botState = botStates.get(user.userId) || { isRunning: false };
                    ws.send(JSON.stringify({
                        type: 'statusUpdate',
                        data: { isRunning: botState.isRunning }
                    }));
                });
            }
        } catch (error) {
            console.error('WebSocket message error:', error);
        }
    });
    
    ws.on('close', () => {
        if (ws.userId) {
            const userConnections = wsConnections.get(ws.userId);
            if (userConnections) {
                userConnections.delete(ws);
                if (userConnections.size === 0) {
                    wsConnections.delete(ws.userId);
                }
            }
        }
    });
});

// Broadcast message to all connections of a specific user
function broadcastToUser(userId, message) {
    const userConnections = wsConnections.get(userId);
    if (userConnections) {
        const messageStr = JSON.stringify(message);
        userConnections.forEach(ws => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(messageStr);
            }
        });
    }
}

// Run bot for specific user
async function runBotForUser(userId, forumUsername, forumPassword) {
    try {
        console.log(`Starting bot for user ${userId}`);
        
        // Import and run the bot function
        const { runForumBot } = require('../bot/hv_bot_module');
        
        const result = await runForumBot(forumUsername, forumPassword, (message) => {
            // Broadcast bot output to user's connections
            broadcastToUser(userId, {
                type: 'botOutput',
                data: message
            });
        });

        // Bot completed successfully
        const botState = botStates.get(userId);
        if (botState) {
            botState.isRunning = false;
            botStates.set(userId, botState);
        }
        
        // Update stats with results
        const stats = await loadUserStats(userId);
        stats.totalPostsUpdated += result.postsUpdated || 0;
        stats.totalCommentsAdded += result.commentsAdded || 0;
        stats.lastRunStatus = 'completed';
        
        // Add to run history
        if (!stats.runHistory) stats.runHistory = [];
        stats.runHistory.unshift({
            date: new Date().toISOString(),
            postsUpdated: result.postsUpdated || 0,
            commentsAdded: result.commentsAdded || 0,
            status: 'completed'
        });
        
        // Keep only last 50 runs in history
        stats.runHistory = stats.runHistory.slice(0, 50);
        
        await saveUserStats(userId, stats);

        broadcastToUser(userId, {
            type: 'botCompleted',
            data: {
                timestamp: new Date().toISOString(),
                postsUpdated: result.postsUpdated || 0,
                commentsAdded: result.commentsAdded || 0
            }
        });

        console.log(`Bot completed successfully for user ${userId}`);
    } catch (error) {
        console.error(`Bot error for user ${userId}:`, error);
        
        const botState = botStates.get(userId);
        if (botState) {
            botState.isRunning = false;
            botStates.set(userId, botState);
        }
        
        // Update stats with error
        const stats = await loadUserStats(userId);
        stats.lastRunStatus = 'error';
        
        if (!stats.runHistory) stats.runHistory = [];
        stats.runHistory.unshift({
            date: new Date().toISOString(),
            postsUpdated: 0,
            commentsAdded: 0,
            status: 'error',
            error: error.message
        });
        stats.runHistory = stats.runHistory.slice(0, 50);
        
        await saveUserStats(userId, stats);

        broadcastToUser(userId, {
            type: 'botError',
            data: {
                timestamp: new Date().toISOString(),
                error: error.message
            }
        });
    }
}

// Start server
server.listen(PORT, () => {
    console.log(`Multi-User HV Forum Bot Server running on http://localhost:${PORT}`);
    console.log('JWT Secret:', JWT_SECRET.substring(0, 16) + '...');
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\nShutting down server...');
    
    // Stop all running bots
    for (const [userId, botState] of botStates) {
        if (botState.process) {
            botState.process.kill('SIGTERM');
        }
    }
    
    // Close all WebSocket connections
    wsConnections.forEach(userConnections => {
        userConnections.forEach(ws => ws.close());
    });
    
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

module.exports = { app, server };