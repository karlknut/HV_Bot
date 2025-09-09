const puppeteer = require("puppeteer");

class GPUPriceTracker {
  constructor(updateCallback = console.log) {
    this.updateCallback = updateCallback;
    this.gpuData = [];
  }

  // Extract GPU model from title using patterns and AI
  async extractGPUModel(title) {
    // Common GPU patterns
    const patterns = [
      // NVIDIA patterns
      /RTX\s*(\d{4}\s*Ti?)/gi,
      /GTX\s*(\d{4}\s*Ti?)/gi,
      /RTX\s*(\d{2}[789]0\s*Ti?)/gi,
      /GeForce\s*RTX\s*(\d{4})/gi,
      
      // AMD patterns
      /RX\s*(\d{4}\s*XT?)/gi,
      /Radeon\s*(\d{4})/gi,
      /RX\s*([567]\d{3})/gi,
      
      // Intel Arc
      /Arc\s*A(\d{3,4})/gi,
    ];

    for (const pattern of patterns) {
      const match = title.match(pattern);
      if (match) {
        return match[0].toUpperCase().replace(/\s+/g, ' ');
      }
    }

    // If no pattern matches, use AI to identify (OpenAI API or similar)
    // For now, return null if no pattern matches
    return null;
  }

  // Extract price from title
  extractPrice(title) {
    const pricePatterns = [
      /AH[:\s]*(\d+)/i,      // AH price
      /OK[:\s]*(\d+)/i,      // OK price
      /€\s*(\d+)/,           // Euro price
      /(\d+)\s*€/,           // Euro price reversed
      /(\d+)\s*eur/i,        // EUR text
    ];

    for (const pattern of pricePatterns) {
      const match = title.match(pattern);
      if (match) {
        return {
          price: parseInt(match[1]),
          currency: pattern.source.includes('AH') ? 'AH' : 
                   pattern.source.includes('OK') ? 'OK' : '€'
        };
      }
    }

    return null;
  }

  async scrapeGPUListings(page) {
    const listings = await page.evaluate(() => {
      const threads = [];
      const rows = document.querySelectorAll('table.forumline tbody tr');
      
      rows.forEach((row, index) => {
        // Skip header rows
        if (index < 3) return;
        
        const titleLink = row.querySelector('a.topictitle');
        if (titleLink) {
          const title = titleLink.textContent.trim();
          const url = titleLink.href;
          const author = row.querySelector('span.name a')?.textContent || 'Unknown';
          const replies = row.querySelector('td:nth-child(3)')?.textContent || '0';
          const lastPost = row.querySelector('td:nth-child(7) span')?.textContent || '';
          
          threads.push({
            title,
            url,
            author,
            replies: parseInt(replies) || 0,
            lastPost
          });
        }
      });
      
      return threads;
    });

    // Process each listing
    for (const listing of listings) {
      const gpuModel = await this.extractGPUModel(listing.title);
      const priceData = this.extractPrice(listing.title);
      
      if (gpuModel && priceData) {
        this.gpuData.push({
          model: gpuModel,
          price: priceData.price,
          currency: priceData.currency,
          title: listing.title,
          url: listing.url,
          author: listing.author,
          date: new Date().toISOString(),
          source: 'forum'
        });
      }
    }

    return listings.length;
  }

  async run(username, password) {
    let browser;

    try {
      this.updateCallback("Starting GPU Price Tracker...");
      
      browser = await puppeteer.launch({
        headless: true,
        defaultViewport: null,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });

      const page = await browser.newPage();

      // Login (reuse existing login logic)
      this.updateCallback("Logging in...");
      await this.login(page, username, password);

      // Navigate to the graphics cards forum
      this.updateCallback("Navigating to graphics cards section...");
      await page.goto("https://foorum.hinnavaatlus.ee/viewforum.php?f=3", {
        waitUntil: "networkidle2"
      });

      // Click filter
      this.updateCallback("Applying filter...");
      await page.waitForSelector('#hvcatlink');
      await page.click('#hvcatlink');

      // Wait for dropdown and select Videokaardid
      await page.waitForSelector('#forum_cat');
      await page.select('#forum_cat', '22'); // Value for Videokaardid option
      
      // Wait for page to reload with filtered results
      await page.waitForNavigation({ waitUntil: 'networkidle2' });

      let pageNum = 1;
      let hasNextPage = true;

      while (hasNextPage && pageNum <= 10) { // Limit to 10 pages for safety
        this.updateCallback(`Scraping page ${pageNum}...`);
        
        const listingsCount = await this.scrapeGPUListings(page);
        this.updateCallback(`Found ${listingsCount} listings on page ${pageNum}`);

        // Check for next page
        const nextPageLink = await page.$('a[title="Järgmine lehekülg"]');
        
        if (nextPageLink) {
          await nextPageLink.click();
          await page.waitForNavigation({ waitUntil: 'networkidle2' });
          pageNum++;
        } else {
          hasNextPage = false;
        }
      }

      this.updateCallback(`Scraping complete! Found ${this.gpuData.length} GPU listings`);
      
      return {
        success: true,
        data: this.gpuData,
        totalListings: this.gpuData.length,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      this.updateCallback(`Error: ${error.message}`);
      return {
        success: false,
        error: error.message,
        data: this.gpuData
      };
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  async login(page, username, password) {
    // Reuse login logic from main bot
    await page.goto("https://auth.hinnavaatlus.ee/ui/login", {
      waitUntil: "networkidle2",
    });

    await page.waitForSelector('input[name="identifier"]');
    await page.type('input[name="identifier"]', username);
    await page.type('input[name="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: "networkidle2" });
  }
}

module.exports = GPUPriceTracker;