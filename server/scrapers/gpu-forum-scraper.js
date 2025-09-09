// server/scrapers/gpu-forum-scraper.js
const puppeteer = require("puppeteer");

class GPUForumScraper {
  constructor(updateCallback = console.log) {
    this.updateCallback = updateCallback;
    this.browser = null;
    this.page = null;
    this.processedThreads = new Set();
    this.gpuData = [];
  }

  // Main execution method
  async scrape(username, password, options = {}) {
    const {
      maxPages = 5,
      maxThreadsPerPage = 30,
      headless = false
    } = options;

    try {
      this.updateCallback("🚀 Starting GPU Forum Scraper...");
      
      // Launch browser
      await this.launchBrowser(headless);
      
      // Login to forum
      await this.login(username, password);
      
      // Navigate to sell section
      await this.navigateToSellSection();
      
      // Apply GPU filter
      await this.applyGPUFilter();
      
      // Scrape pages
      await this.scrapeAllPages(maxPages, maxThreadsPerPage);
      
      this.updateCallback(`✅ Scraping complete! Found ${this.gpuData.length} GPU listings`);
      
      return {
        success: true,
        data: this.gpuData,
        totalListings: this.gpuData.length,
        processedThreads: this.processedThreads.size
      };
      
    } catch (error) {
      this.updateCallback(`❌ Scraper error: ${error.message}`);
      return {
        success: false,
        error: error.message,
        data: this.gpuData,
        partialResults: this.gpuData.length > 0
      };
    } finally {
      await this.cleanup();
    }
  }

  // Launch browser
  async launchBrowser(headless) {
    this.updateCallback("🌐 Launching browser...");
    this.browser = await puppeteer.launch({
      headless,
      defaultViewport: null,
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });
    this.page = await this.browser.newPage();
    
    // Set longer timeout for slow connections
    this.page.setDefaultTimeout(30000);
  }

  // Login to forum
  async login(username, password) {
    this.updateCallback("🔐 Logging in to forum...");
    
    await this.page.goto("https://auth.hinnavaatlus.ee/ui/login", {
      waitUntil: "networkidle2",
      timeout: 30000
    });

    // Wait for the login form
    await this.page.waitForSelector('input[name="identifier"]', { timeout: 10000 });
    
    // Fill in credentials
    await this.page.type('input[name="identifier"]', username);
    await this.page.type('input[name="password"]', password);
    
    // Click the correct submit button - using the exact selector you provided
    await this.page.waitForSelector('body > div > section > div > div > div > form:nth-child(5) > button[type="submit"]');
    await this.page.click('body > div > section > div > div > div > form:nth-child(5) > button[type="submit"]');
    
    // Wait for navigation
    await this.page.waitForNavigation({
      waitUntil: "networkidle2",
      timeout: 30000
    });
    
    // Verify login success
    const currentUrl = this.page.url();
    if (currentUrl.includes("login")) {
      throw new Error("Login failed - still on login page");
    }
    
    this.updateCallback("✅ Login successful!");
  }

  // Navigate to sell section
  async navigateToSellSection() {
    this.updateCallback("📱 Navigating to sell section...");
    
    await this.page.goto("https://foorum.hinnavaatlus.ee/viewforum.php?f=3", {
      waitUntil: "networkidle2",
      timeout: 30000
    });
    
    // Wait for forum table to load
    await this.page.waitForSelector("table.forumline", { timeout: 10000 });
  }

  // Apply GPU filter using forum's filtering system
  async applyGPUFilter() {
    this.updateCallback("🔍 Applying GPU filter...");
    
    try {
      // Click filter link
      await this.page.waitForSelector("#hvcatlink", { timeout: 10000 });
      await this.page.click("#hvcatlink");
      this.updateCallback("Clicked filter link");
      
      // Wait for dropdown to appear
      await this.page.waitForSelector("#forum_cat", { 
        visible: true,
        timeout: 5000 
      });
      this.updateCallback("Filter dropdown appeared");
      
      // Select Videokaardid (option value 22)
      await this.page.select("#forum_cat", "22");
      this.updateCallback("Selected Videokaardid option");
      
      // Small delay to ensure selection registers
      await this.page.waitForTimeout(500);
      
      // Click search button
      const searchButton = await this.page.$("#hvcatform > table > tbody > tr:nth-child(1) > td.row2 > input");
      if (searchButton) {
        await searchButton.click();
        this.updateCallback("Clicked search button");
      } else {
        // Try alternative selectors
        const altButton = await this.page.$('input[value="Otsi"]') || 
                         await this.page.$('input[type="submit"]');
        if (altButton) {
          await altButton.click();
          this.updateCallback("Clicked search button (alternative)");
        } else {
          throw new Error("Could not find search button");
        }
      }
      
      // Wait for filtered results
      await this.page.waitForNavigation({
        waitUntil: "networkidle2",
        timeout: 30000
      });
      
      this.updateCallback("✅ GPU filter applied successfully");
      
    } catch (error) {
      this.updateCallback(`⚠️ Filter failed: ${error.message}, continuing anyway...`);
      // Continue without filter - will still work but less targeted
    }
  }

  // Scrape all pages
  async scrapeAllPages(maxPages, maxThreadsPerPage) {
    let currentPage = 1;
    let hasNextPage = true;
    
    while (hasNextPage && currentPage <= maxPages) {
      this.updateCallback(`📄 Scraping page ${currentPage}/${maxPages}...`);
      
      // Get all thread links on current page
      const threadLinks = await this.getThreadLinks();
      this.updateCallback(`Found ${threadLinks.length} threads on page ${currentPage}`);
      
      // Process each thread
      let processedCount = 0;
      for (const thread of threadLinks) {
        if (processedCount >= maxThreadsPerPage) break;
        if (this.processedThreads.has(thread.url)) continue;
        
        await this.scrapeThread(thread);
        this.processedThreads.add(thread.url);
        processedCount++;
        
        // Small delay between threads to avoid being too aggressive
        await this.page.waitForTimeout(500);
      }
      
      // Try to go to next page
      hasNextPage = await this.navigateToNextPage();
      currentPage++;
    }
  }

  // Get all thread links from current page
  async getThreadLinks() {
    return await this.page.evaluate(() => {
      const threads = [];
      const rows = document.querySelectorAll("table.forumline tr");
      
      // Skip header rows
      for (let i = 3; i < rows.length; i++) {
        const row = rows[i];
        const titleLink = row.querySelector('a[href*="viewtopic.php"]');
        
        if (titleLink) {
          const title = titleLink.textContent.trim();
          const url = titleLink.href;
          
          // Get author
          let author = "Unknown";
          const authorLink = row.querySelector('a[href*="profile.php"]') || 
                           row.querySelector('.username');
          if (authorLink) {
            author = authorLink.textContent.trim();
          }
          
          threads.push({ title, url, author });
        }
      }
      
      return threads;
    });
  }

  // Scrape individual thread
  async scrapeThread(thread) {
    try {
      this.updateCallback(`🔍 Processing: ${thread.title.substring(0, 50)}...`);
      
      // Navigate to thread
      await this.page.goto(thread.url, {
        waitUntil: "networkidle2",
        timeout: 20000
      });
      
      // Extract thread content
      const threadData = await this.extractThreadData();
      
      // Combine all text for analysis
      const fullText = `${thread.title} ${threadData.content}`;
      
      // Extract GPU model and price
      const gpuModel = this.extractGPUModel(fullText);
      const priceData = this.extractPrice(fullText);
      
      if (gpuModel && priceData) {
        const listing = {
          id: this.generateId(thread.url),
          model: gpuModel,
          brand: this.detectBrand(gpuModel),
          price: priceData.price,
          currency: priceData.currency,
          title: thread.title,
          url: thread.url,
          author: thread.author,
          scraped_at: new Date().toISOString()
        };
        
        this.gpuData.push(listing);
        this.updateCallback(`✅ Found: ${gpuModel} - ${priceData.price}${priceData.currency}`);
      } else {
        this.updateCallback(`⚠️ No GPU/price found in: ${thread.title.substring(0, 30)}`);
      }
      
      // Navigate back to forum list
      await this.page.goBack({
        waitUntil: "networkidle2",
        timeout: 20000
      });
      
    } catch (error) {
      this.updateCallback(`❌ Error scraping thread: ${error.message}`);
      // Try to recover by going back to forum
      try {
        await this.page.goto("https://foorum.hinnavaatlus.ee/viewforum.php?f=3&c=22", {
          waitUntil: "networkidle2"
        });
      } catch (navError) {
        // Ignore navigation error
      }
    }
  }

  // Extract thread data from page
  async extractThreadData() {
    return await this.page.evaluate(() => {
      // Try multiple selectors for post content
      const contentSelectors = [
        '.postbody',
        'td.row1[valign="top"] span.postbody',
        '.post-content',
        'table.forumline td span.postbody'
      ];
      
      let content = "";
      for (const selector of contentSelectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          // Get first post content (original post)
          content = elements[0].textContent || elements[0].innerText || "";
          if (content.length > 50) break;
        }
      }
      
      return {
        content: content.trim(),
        title: document.title
      };
    });
  }

  // Extract GPU model from text
  extractGPUModel(text) {
    const cleanText = text.toUpperCase().replace(/[^\w\s]/g, " ");
    
    // GPU model patterns
    const patterns = [
      // NVIDIA RTX 40xx series
      /RTX\s*40[5-9]0\s*(TI|SUPER)?/gi,
      /RTX\s*4060\s*(TI)?/gi,
      /RTX\s*4070\s*(TI|SUPER)?/gi,
      /RTX\s*4080\s*(SUPER)?/gi,
      /RTX\s*4090/gi,
      
      // NVIDIA RTX 30xx series
      /RTX\s*30[5-9]0\s*(TI)?/gi,
      /RTX\s*3060\s*(TI)?/gi,
      /RTX\s*3070\s*(TI)?/gi,
      /RTX\s*3080\s*(TI)?/gi,
      /RTX\s*3090\s*(TI)?/gi,
      
      // NVIDIA RTX 20xx series
      /RTX\s*20[6-8]0\s*(SUPER)?/gi,
      
      // NVIDIA GTX series
      /GTX\s*16[5-6]0\s*(TI|SUPER)?/gi,
      /GTX\s*10[5-8]0\s*(TI)?/gi,
      /GTX\s*9[6-8]0/gi,
      
      // AMD RX 7000 series
      /RX\s*7[0-9]00\s*(XT|XTX)?/gi,
      
      // AMD RX 6000 series  
      /RX\s*6[0-9]00\s*(XT|XTX)?/gi,
      
      // AMD RX 5000 series
      /RX\s*5[0-9]00\s*(XT)?/gi,
      
      // Intel Arc
      /ARC\s*A[0-9]{3,4}/gi
    ];
    
    for (const pattern of patterns) {
      const matches = text.match(pattern);
      if (matches && matches.length > 0) {
        // Return the first match, cleaned up
        return matches[0].trim().replace(/\s+/g, " ");
      }
    }
    
    return null;
  }

  // Extract price from text
  extractPrice(text) {
    // Price patterns for Estonian forum
    const patterns = [
      { regex: /AH[:\s]*(\d+)/gi, currency: "AH" },
      { regex: /OK[:\s]*(\d+)/gi, currency: "OK" },
      { regex: /€\s*(\d+(?:[,\.]\d{2})?)/g, currency: "€" },
      { regex: /(\d+(?:[,\.]\d{2})?)\s*€/g, currency: "€" },
      { regex: /(\d+(?:[,\.]\d{2})?)\s*EUR/gi, currency: "€" },
      { regex: /HIND[:\s]*(\d+)/gi, currency: "€" },
      { regex: /(\d{2,4})\s*eurot?/gi, currency: "€" }
    ];
    
    for (const pattern of patterns) {
      const matches = [...text.matchAll(pattern.regex)];
      if (matches.length > 0) {
        for (const match of matches) {
          let price = parseFloat(match[1].replace(",", "."));
          
          // Validate price range (GPUs typically 50-5000 EUR)
          if (!isNaN(price) && price >= 50 && price <= 5000) {
            return {
              price: Math.round(price),
              currency: pattern.currency
            };
          }
        }
      }
    }
    
    return null;
  }

  // Detect GPU brand from model
  detectBrand(model) {
    if (!model) return "Unknown";
    
    const modelUpper = model.toUpperCase();
    
    if (modelUpper.includes("RTX") || modelUpper.includes("GTX")) {
      return "NVIDIA";
    }
    if (modelUpper.includes("RX") || modelUpper.includes("RADEON")) {
      return "AMD";
    }
    if (modelUpper.includes("ARC")) {
      return "Intel";
    }
    
    return "Unknown";
  }

  // Navigate to next page
  async navigateToNextPage() {
    try {
      // Look for next page link
      const nextPageLink = await this.page.$('a[title="Järgmine lehekülg"]') ||
                          await this.page.$('a:has-text("Järgmine")') ||
                          await this.page.$('span.nav a:has-text("Järgmine")');
      
      if (nextPageLink) {
        await nextPageLink.click();
        await this.page.waitForNavigation({
          waitUntil: "networkidle2",
          timeout: 30000
        });
        return true;
      }
      
      return false;
    } catch (error) {
      this.updateCallback(`No more pages or navigation failed: ${error.message}`);
      return false;
    }
  }

  // Generate unique ID
  generateId(url) {
    const threadId = url.split("t=")[1]?.split("&")[0] || Date.now();
    return `gpu_${threadId}_${Date.now()}`;
  }

  // Cleanup
  async cleanup() {
    if (this.browser) {
      await this.browser.close();
      this.updateCallback("🔒 Browser closed");
    }
  }
}

module.exports = GPUForumScraper;