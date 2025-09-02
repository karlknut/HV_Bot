// setup.js - Creates the new folder structure and configures the application
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

async function createDirectory(dirPath) {
    try {
        await fs.access(dirPath);
        console.log(`✓ Directory exists: ${dirPath}`);
    } catch {
        await fs.mkdir(dirPath, { recursive: true });
        console.log(`✓ Created directory: ${dirPath}`);
    }
}

async function createFile(filePath, content) {
    try {
        await fs.access(filePath);
        console.log(`⚠ File already exists: ${filePath}`);
    } catch {
        await fs.writeFile(filePath, content);
        console.log(`✓ Created file: ${filePath}`);
    }
}

async function setup() {
    console.log('🚀 Setting up HV Forum Bot Multi-User Application...\n');

    try {
        // Create directory structure
        console.log('Creating directory structure...');
        await createDirectory('server');
        await createDirectory('server/utils');
        await createDirectory('bot');
        await createDirectory('public');
        await createDirectory('public/css');
        await createDirectory('public/js');
        await createDirectory('public/pages');
        await createDirectory('data');
        await createDirectory('data/user_stats');

        // Generate secure environment variables
        const jwtSecret = crypto.randomBytes(64).toString('hex');
        const encryptionKey = crypto.randomBytes(32).toString('hex');

        // Create .env file
        const envContent = `# HV Forum Bot Multi-User Configuration
# Generated on ${new Date().toISOString()}

# JWT Secret for user authentication (keep this secret!)
JWT_SECRET=${jwtSecret}

# Encryption key for forum credentials (keep this secret!)
ENCRYPTION_KEY=${encryptionKey}

# Server port
PORT=3000

# Optional: Set to production for production deployment
NODE_ENV=development
`;

        await createFile('.env', envContent);

        // Create empty users.json
        await createFile('data/users.json', '{}');

        // Create .gitignore
        const gitignoreContent = `# Dependencies
node_modules/

# Environment variables
.env
.env.local
.env.*.local

# User data (contains sensitive information)
data/users.json
data/user_stats/

# Logs
logs/
*.log
npm-debug.log*

# OS generated files
.DS_Store
Thumbs.db
*.swp
*.swo

# Editor files
.vscode/
.idea/
*.sublime-*

# Puppeteer
.local-chromium/

# Build files
dist/
build/

# Temporary files
tmp/
temp/
`;

        await createFile('.gitignore', gitignoreContent);

        // Create README
        const readmeContent = `# HV Forum Bot - Multi-User Edition

A secure, multi-user web application for automating forum activities with encrypted credential storage.

## 🚀 Quick Start

1. **Install Dependencies**
   \`\`\`bash
   npm install
   \`\`\`

2. **Run Setup Script** (if not already done)
   \`\`\`bash
   npm run setup
   \`\`\`

3. **Start the Application**
   \`\`\`bash
   npm start
   \`\`\`

4. **Access the Application**
   - Open your browser to \`http://localhost:3000\`
   - Register a new account
   - Set your forum credentials in the dashboard
   - Start your bot!

## 📁 Project Structure

\`\`\`
hv-forum-bot/
├── server/                 # Backend server files
│   ├── server.js          # Main server with authentication
│   └── utils/             # Utility modules
│       └── encryption.js  # Fixed encryption utility
├── bot/                   # Bot logic
│   └── hv_bot_module.js   # Forum automation module
├── public/                # Frontend files
│   ├── css/              # Stylesheets
│   │   ├── common.css    # Shared styles
│   │   └── [page].css    # Page-specific styles
│   ├── js/               # JavaScript files
│   │   ├── common.js     # Shared utilities
│   │   └── [page].js     # Page-specific scripts
│   └── pages/            # HTML pages
│       ├── login.html
│       ├── dashboard.html
│       └── status.html
├── data/                  # User data (gitignored)
│   ├── users.json        # User accounts
│   └── user_stats/       # User statistics
└── .env                   # Environment variables
\`\`\`

## 🔒 Security Features

- **Bcrypt Password Hashing**: User passwords are securely hashed
- **AES-256-CBC Encryption**: Forum credentials are encrypted
- **JWT Authentication**: Secure token-based authentication
- **User Isolation**: Complete data separation between users
- **WebSocket Security**: Authenticated real-time connections

## 🛠️ Available Scripts

- \`npm start\`: Start the production server
- \`npm run dev\`: Start with auto-reload (requires nodemon)
- \`npm run setup\`: Initialize project structure
- \`npm run clean\`: Clear user data (use with caution!)

## 🔧 Configuration

Environment variables in \`.env\`:
- \`JWT_SECRET\`: Secret key for JWT tokens
- \`ENCRYPTION_KEY\`: Key for encrypting credentials
- \`PORT\`: Server port (default: 3000)
- \`NODE_ENV\`: Environment (development/production)

## 📝 API Endpoints

### Public Endpoints
- \`POST /api/register\`: Register new user
- \`POST /api/login\`: User login

### Protected Endpoints (require JWT)
- \`GET /api/stats\`: Get user statistics
- \`POST /api/forum-credentials\`: Save encrypted credentials
- \`POST /api/start-bot\`: Start user's bot
- \`POST /api/stop-bot\`: Stop user's bot

## ⚠️ Important Notes

1. **Never commit \`.env\` file** to version control
2. **Backup \`data/\` directory** regularly
3. **Use HTTPS in production** for security
4. **Monitor server logs** for suspicious activity
5. **Update dependencies** regularly for security patches

## 🚀 Deployment Tips

For production deployment:
1. Use a process manager like PM2
2. Set up reverse proxy with nginx
3. Enable HTTPS with SSL certificates
4. Consider using a database instead of JSON files
5. Implement rate limiting and monitoring

## 📄 License

MIT License - See LICENSE file for details

## 🤝 Contributing

Contributions are welcome! Please create a pull request with your changes.

## 🐛 Troubleshooting

- **Bot won't start**: Check forum credentials are saved
- **Login issues**: Verify JWT_SECRET hasn't changed
- **Permission errors**: Check write permissions for data/ directory
- **Port conflicts**: Change PORT in .env file
`;

        await createFile('README.md', readmeContent);

        // Migration message for existing files
        console.log('\n📦 Setup completed successfully!');
        console.log('\n⚠️  IMPORTANT: Manual migration required for existing files:');
        console.log('\n1. Move your existing files to the new structure:');
        console.log('   - Move server.js → server/server.js');
        console.log('   - Move hv_bot_module.js → bot/hv_bot_module.js');
        console.log('   - Create server/utils/encryption.js (with the fixed code)');
        console.log('   - Split HTML files and move to public/pages/');
        console.log('   - Extract CSS to public/css/');
        console.log('   - Extract JS to public/js/');
        console.log('\n2. Update the server files to use the new encryption module');
        console.log('\n3. Update HTML files to reference the new CSS/JS paths');
        console.log('\n4. Run "npm install" to ensure all dependencies are installed');
        console.log('\n5. Run "npm start" to start the server');
        console.log('\n✨ Your secure keys have been generated in .env file');
        console.log('🔒 Keep your .env file secure and never commit it!');

    } catch (error) {
        console.error('❌ Setup failed:', error.message);
        process.exit(1);
    }
}

// Run setup
setup();