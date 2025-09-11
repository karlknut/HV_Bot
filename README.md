# HV Forum Bot - Multi-User Edition with GPU Tracker

A powerful multi-user automation platform for HV Forum with dual functionality: automated forum post management and GPU price tracking with AI-enhanced market analysis.

## 🚀 Features

### Core Platform Features

- **Multi-User Support**: Each user has their own isolated account and bot instance
- **Secure Authentication**: JWT-based authentication with bcrypt password hashing
- **Encrypted Credentials**: Forum passwords encrypted using AES-256-GCM
- **Real-time Updates**: WebSocket-based live status updates and progress tracking
- **User Isolation**: Complete data separation between users
- **Modern UI**: Responsive design with animated backgrounds and professional modals

### Forum Bot Features

- **Automated Post Updates**: Refreshes your forum posts to keep them visible
- **Smart Comment Addition**: Adds thumbs up (👍) comments to threads needing engagement
- **Thread Detection**: Intelligently identifies your threads vs others' threads
- **Batch Processing**: Processes multiple threads in a single run
- **Success Tracking**: Detailed statistics on posts updated and comments added

### GPU Price Tracker (NEW!)

- **Deep Forum Scanning**: Scans up to 20 pages of forum listings
- **Smart GPU Detection**: AI-enhanced pattern matching for GPU model identification
- **PC Build Filtering**: Automatically skips full computer builds
- **Multi-GPU Support**: Handles listings with multiple GPUs
- **Location Extraction**: Identifies seller location from Estonian cities
- **Duplicate Management**: Intelligent duplicate detection and removal
- **Price Analytics**: Track average, minimum, and maximum prices by model
- **Market Insights**: Top models by popularity and price trends
- **Advanced Filtering**: Filter by model, price range, currency
- **Pagination**: View 10-200 listings per page with easy navigation

## 📋 Prerequisites

- Node.js 16.0.0 or higher
- npm or yarn package manager
- Supabase account (for database)
- HV Forum account credentials

## 🛠️ Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/yourusername/hv-forum-bot.git
   cd hv-forum-bot
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Set up environment variables**
   Create a `.env` file in the root directory:

   ```env
   # Authentication
   JWT_SECRET=your-generated-jwt-secret
   ENCRYPTION_KEY=your-generated-encryption-key

   # Supabase Configuration
   SUPABASE_URL=your-supabase-url
   SUPABASE_ANON_KEY=your-supabase-anon-key

   # Server Configuration
   PORT=3000
   NODE_ENV=development
   ```

4. **Run database migrations**
   Execute the following SQL in your Supabase dashboard:

   ```sql
   -- Create tables
   CREATE TABLE users (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     username VARCHAR(255) UNIQUE NOT NULL,
     password_hash TEXT NOT NULL,
     created_at TIMESTAMP DEFAULT NOW()
   );

   CREATE TABLE forum_credentials (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id UUID REFERENCES users(id) ON DELETE CASCADE,
     encrypted_username TEXT NOT NULL,
     encrypted_password TEXT NOT NULL,
     updated_at TIMESTAMP DEFAULT NOW()
   );

   CREATE TABLE user_stats (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id UUID REFERENCES users(id) ON DELETE CASCADE,
     total_runs INTEGER DEFAULT 0,
     total_posts_updated INTEGER DEFAULT 0,
     total_comments_added INTEGER DEFAULT 0,
     last_run_date TIMESTAMP,
     last_run_status VARCHAR(50)
   );

   CREATE TABLE run_history (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id UUID REFERENCES users(id) ON DELETE CASCADE,
     run_date TIMESTAMP DEFAULT NOW(),
     status VARCHAR(50),
     bot_type VARCHAR(20) DEFAULT 'forum',
     posts_updated INTEGER,
     comments_added INTEGER,
     thread_titles TEXT[],
     gpus_found INTEGER,
     new_gpus INTEGER,
     duplicates INTEGER,
     pages_scanned INTEGER,
     duration_seconds INTEGER,
     error_message TEXT
   );

   CREATE TABLE gpu_listings (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     model VARCHAR(255) NOT NULL,
     brand VARCHAR(100),
     price DECIMAL(10,2) NOT NULL,
     currency VARCHAR(10) NOT NULL,
     title TEXT,
     url TEXT UNIQUE NOT NULL,
     author VARCHAR(255),
     location VARCHAR(100),
     source VARCHAR(50),
     scraped_at TIMESTAMP DEFAULT NOW(),
     user_id UUID REFERENCES users(id)
   );

   CREATE TABLE gpu_price_history (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     gpu_model VARCHAR(255) NOT NULL,
     brand VARCHAR(100),
     avg_price DECIMAL(10,2),
     min_price DECIMAL(10,2),
     max_price DECIMAL(10,2),
     listing_count INTEGER,
     currencies TEXT[],
     date DATE NOT NULL,
     UNIQUE(gpu_model, date)
   );

   -- Create indexes for performance
   CREATE INDEX idx_gpu_listings_model ON gpu_listings(model);
   CREATE INDEX idx_gpu_listings_scraped_at ON gpu_listings(scraped_at DESC);
   CREATE INDEX idx_run_history_bot_type ON run_history(bot_type);
   CREATE INDEX idx_gpu_listings_location ON gpu_listings(location);
   ```

5. **Start the application**

   ```bash
   npm start
   ```

6. **Access the application**
   Open your browser and navigate to `http://localhost:3000`

## 📁 Project Structure

```
hv-forum-bot/
├── server/
│   ├── server.js              # Main server with authentication
│   ├── auth.js                # Authentication middleware
│   ├── bot-manager.js         # Bot instance management
│   ├── gpu-tracker.js         # GPU tracking logic
│   ├── db/
│   │   └── supabase.js        # Database functions
│   ├── scrapers/
│   │   └── gpu-forum-scraper.js  # GPU listing scraper
│   ├── services/
│   │   └── gpu-data-processor.js # GPU data processing
│   └── utils/
│       └── encryption.js      # Encryption utilities
├── bot/
│   └── hv_bot_module.js      # Forum automation module
├── public/
│   ├── css/                   # Stylesheets
│   │   ├── common.css
│   │   ├── dashboard.css
│   │   ├── status.css
│   │   └── gpu-tracker.css
│   ├── js/                    # JavaScript files
│   │   ├── common.js
│   │   ├── dashboard.js
│   │   ├── status-enhanced.js
│   │   └── gpu-tracker.js
│   └── pages/                 # HTML pages
│       ├── login.html
│       ├── dashboard.html
│       ├── status.html
│       └── gpu-tracker.html
├── .env                       # Environment variables
├── .gitignore                 # Git ignore rules
├── package.json               # Node.js dependencies
└── README.md                  # This file
```

## 🎮 Usage

### Initial Setup

1. Register a new account on the login page
2. Log in with your credentials
3. Navigate to the dashboard
4. Set your forum credentials (they will be encrypted)

### Using the Forum Bot

1. Go to the Dashboard
2. Click "Start Bot" to begin automation
3. Monitor progress in real-time
4. View detailed statistics on the Status page

### Using the GPU Tracker

1. Navigate to GPU Tracker from the header menu
2. Click "Deep Scan" to scan forum for GPU listings
3. Use filters to find specific models or price ranges
4. Click "View" on any listing for detailed information
5. Check for duplicates and remove them if needed
6. Monitor market trends in the statistics section

## 🔒 Security Features

- **Password Security**: All user passwords hashed with bcrypt (10 salt rounds)
- **Credential Encryption**: Forum passwords encrypted with AES-256-GCM
- **JWT Tokens**: Secure token-based authentication (24-hour expiry)
- **Data Isolation**: Complete separation between user data
- **Input Validation**: All inputs sanitized and validated
- **HTTPS Ready**: Configured for SSL/TLS in production

## 📊 API Endpoints

### Authentication

- `POST /api/register` - Register new user
- `POST /api/login` - User login

### Protected Routes (require JWT)

- `GET /api/stats` - Get user statistics
- `GET /api/forum-credentials` - Check credentials status
- `POST /api/forum-credentials` - Save encrypted credentials
- `POST /api/start-bot` - Start forum bot
- `POST /api/stop-bot` - Stop forum bot

### GPU Tracker Routes

- `POST /api/gpu/scan` - Start GPU scanning
- `GET /api/gpu/listings` - Get GPU listings with filters
- `GET /api/gpu/stats` - Get GPU market statistics
- `GET /api/gpu/duplicates` - Check for duplicate listings
- `POST /api/gpu/remove-duplicates` - Remove duplicate listings
- `DELETE /api/gpu/clear-all` - Clear all GPU data

## 🚀 Deployment

### Production Considerations

1. **Use HTTPS**: Always use SSL/TLS certificates in production
2. **Environment Variables**: Never commit `.env` file to version control
3. **Process Manager**: Use PM2 or similar for process management
4. **Reverse Proxy**: Configure nginx or Apache as reverse proxy
5. **Database Backups**: Implement regular Supabase backups
6. **Monitoring**: Set up logging and monitoring (e.g., New Relic, Datadog)
7. **Rate Limiting**: Implement rate limiting for API endpoints

### Docker Deployment (Optional)

```dockerfile
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["node", "server/server.js"]
```

## 🐛 Troubleshooting

### Common Issues

**Bot won't start**

- Verify forum credentials are saved correctly
- Check that you're not already running a bot instance
- Ensure forum is accessible

**GPU scan finds no results**

- Verify forum credentials are correct
- Check if forum structure has changed
- Ensure you're logged in successfully

**Duplicate listings**

- Use "Check Duplicates" button to identify them
- Click to remove duplicates automatically

**Login issues**

- Verify JWT_SECRET hasn't changed
- Check token expiry (24 hours)
- Clear browser localStorage and retry

**Database connection errors**

- Verify Supabase credentials in `.env`
- Check Supabase service status
- Ensure database migrations are complete

## 📝 License

MIT License - See LICENSE file for details

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📞 Support

For issues, questions, or suggestions:

- Open an issue on GitHub
- Contact the maintainer
- Check the FAQ section

## 🔄 Changelog

### Version 2.2.0 (Current)

- Added GPU Price Tracker with AI-enhanced detection
- Implemented smart PC build filtering
- Added location extraction for sellers
- Enhanced status page with dual bot tracking
- Improved pagination and filtering system
- Added duplicate management features

### Version 2.1.0

- Multi-user support implementation
- Supabase integration
- Enhanced security with encryption
- Real-time WebSocket updates

### Version 1.0.0

- Initial release with basic forum automation

## 🙏 Acknowledgments

- HV Forum community
- Puppeteer for web automation
- Supabase for database services
- All contributors and testers

---

**Note**: This bot is for educational purposes. Always respect forum rules and terms of service.
