// setup.js - Run this script after npm install to configure the application
const fs = require('fs').promises;
const crypto = require('crypto');
const path = require('path');

async function setup() {
    console.log('Setting up HV Forum Bot Multi-User Application...\n');

    try {
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

# Optional: Database URL if you want to use a database instead of JSON files
# DATABASE_URL=your_database_url_here
`;

        await fs.writeFile('.env', envContent);
        console.log('✓ Created .env file with secure keys');

        // Create directories for user data
        try {
            await fs.access('user_stats');
        } catch {
            await fs.mkdir('user_stats');
            console.log('✓ Created user_stats directory');
        }

        // Create empty users.json if it doesn't exist
        try {
            await fs.access('users.json');
        } catch {
            await fs.writeFile('users.json', '{}');
            console.log('✓ Created users.json file');
        }

        // Create gitignore if it doesn't exist
        const gitignoreContent = `# Dependencies
node_modules/

# Environment variables
.env

# User data (contains sensitive information)
users.json
user_stats/
credentials.json

# Logs
*.log

# OS generated files
.DS_Store
Thumbs.db

# Editor files
.vscode/
.idea/
*.swp
*.swo

# Puppeteer
.local-chromium/
`;

        try {
            await fs.access('.gitignore');
        } catch {
            await fs.writeFile('.gitignore', gitignoreContent);
            console.log('✓ Created .gitignore file');
        }

        // Create README with setup instructions
        const readmeContent = `# HV Forum Bot - Multi-User Edition

A secure, multi-user web application for automating forum activities with encrypted credential storage.

## Features

- **Multi-User Support**: Each user has their own account and bot instance
- **Secure Authentication**: JWT-based authentication with bcrypt password hashing
- **Encrypted Credentials**: Forum passwords are encrypted and stored securely
- **Real-time Updates**: WebSocket-based real-time status updates
- **User Isolation**: Each user's data and bot runs are completely isolated
- **Modern UI**: Responsive design with animated backgrounds

## Security Features

- Passwords are hashed using bcrypt with salt rounds
- Forum credentials are encrypted using AES-256-CBC
- JWT tokens for secure API authentication
- User data isolation (no user can see other users' data)
- Environment variables for sensitive configuration
- Secure WebSocket authentication

## Setup Instructions

1. **Install Dependencies**
   \`\`\`bash
   npm install
   \`\`\`

2. **Run Setup Script**
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
   - Set your forum credentials
   - Start your bot!

## File Structure

\`\`\`
├── server.js              # Main server file with authentication
├── hv_bot_module.js       # Bot logic (unchanged)
├── login.html             # Login/Register page
├── dashboard.html         # User dashboard
├── user_status.html       # Status page (to be created)
├── package.json           # Dependencies
├── .env                   # Environment variables (auto-generated)
├── users.json             # User accounts (auto-generated)
└── user_stats/            # Individual user statistics (auto-generated)
    ├── user1.json
    ├── user2.json
    └── ...
\`\`\`

## Environment Variables

The setup script automatically generates these in \`.env\`:

- \`JWT_SECRET\`: Secret key for JWT token signing
- \`ENCRYPTION_KEY\`: Key for encrypting forum credentials
- \`PORT\`: Server port (default: 3000)

## API Endpoints

### Authentication
- \`POST /api/register\` - Register new user
- \`POST /api/login\` - Login user

### Protected Routes (require JWT token)
- \`GET /api/stats\` - Get user statistics
- \`POST /api/forum-credentials\` - Save encrypted forum credentials
- \`POST /api/start-bot\` - Start user's bot
- \`POST /api/stop-bot\` - Stop user's bot

## Development

For development with auto-restart:
\`\`\`bash
npm run dev
\`\`\`

## Security Notes

1. **Never commit sensitive files**: The .gitignore excludes user data and environment files
2. **Change default keys in production**: Regenerate JWT_SECRET and ENCRYPTION_KEY for production
3. **Use HTTPS in production**: Always use SSL/TLS in production environments
4. **Regular backups**: Backup user_stats/ directory regularly
5. **Monitor logs**: Check server logs for suspicious activity

## Deployment Considerations

1. **Database**: Consider using a proper database (PostgreSQL, MongoDB) instead of JSON files for production
2. **Redis**: Use Redis for session storage in multi-instance deployments
3. **Load Balancing**: Use a reverse proxy (nginx) for load balancing
4. **Process Management**: Use PM2 or similar for process management
5. **Monitoring**: Implement proper logging and monitoring

## Troubleshooting

- **Bot won't start**: Check that forum credentials are saved correctly
- **Login issues**: Verify JWT_SECRET is consistent
- **Permission errors**: Ensure write permissions for user_stats/ directory
- **Port conflicts**: Change PORT in .env file if 3000 is in use

## License

MIT License - See LICENSE file for details
`;

        await fs.writeFile('README.md', readmeContent);
        console.log('✓ Created README.md with setup instructions');

        console.log('\n🎉 Setup completed successfully!');
        console.log('\nNext steps:');
        console.log('1. Run "npm start" to start the server');
        console.log('2. Open http://localhost:3000 in your browser');
        console.log('3. Register a new account to get started');
        console.log('\n⚠️  Important: Keep your .env file secure and never commit it to version control!');

    } catch (error) {
        console.error('Setup failed:', error.message);
        process.exit(1);
    }
}

setup();