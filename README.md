# HV Forum Bot - Multi-User Edition

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

   ```bash
   npm install
   ```

2. **Run Setup Script**

   ```bash
   npm run setup
   ```

3. **Start the Application**

   ```bash
   npm start
   ```

4. **Access the Application**
   - Open your browser to `http://localhost:3000`
   - Register a new account
   - Set your forum credentials
   - Start your bot!

## File Structure

```
hv-forum-bot/
├── server/
│   ├── server.js
│   ├── auth.js
│   ├── bot-manager.js
│   └── utils/
│       └── encryption.js
├── bot/
│   └── hv_bot_module.js
├── public/
│   ├── css/
│   │   ├── common.css
│   │   ├── login.css
│   │   ├── dashboard.css
│   │   └── status.css
│   ├── js/
│   │   ├── common.js
│   │   ├── login.js
│   │   ├── dashboard.js
│   │   └── status.js
│   └── pages/
│       ├── login.html
│       ├── dashboard.html
│       └── status.html
├── data/
│   ├── users.json
│   └── user_stats/
├── .env
├── .gitignore
├── package.json
├── setup.js
└── README.md
```

## Environment Variables

The setup script automatically generates these in `.env`:

- `JWT_SECRET`: Secret key for JWT token signing
- `ENCRYPTION_KEY`: Key for encrypting forum credentials
- `PORT`: Server port (default: 3000)

## API Endpoints

### Authentication

- `POST /api/register` - Register new user
- `POST /api/login` - Login user

### Protected Routes (require JWT token)

- `GET /api/stats` - Get user statistics
- `POST /api/forum-credentials` - Save encrypted forum credentials
- `POST /api/start-bot` - Start user's bot
- `POST /api/stop-bot` - Stop user's bot

## Development

For development with auto-restart:

```bash
npm run dev
```

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
