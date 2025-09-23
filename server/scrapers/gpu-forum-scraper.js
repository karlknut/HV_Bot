// server/scrapers/gpu-forum-scraper.js - Fixed version without login requirement
const puppeteer = require("puppeteer");

class GPUForumScraper {
  constructor(updateCallback = console.log) {
    this.updateCallback = updateCallback;
    this.browser = null;
    this.page = null;
    this.processedThreads = new Set();
    this.gpuData = [];
  }

  async scrape(options = {}) {
    const { maxPages = 20, headless = true } = options;

    try {
      this.updateCallback("🚀 Starting GPU Forum Scraper (No Login Required)...");

      await this.launchBrowser(headless);
      
      // Skip login - go directly to the forum
      this.updateCallback("📄 Going directly to forum listings...");

      // Start from page 1 (start=0)
      let startOffset = 0;
      let currentPage = 1;
      const increment = 25; // Increment by 25 for each page

      while (currentPage <= maxPages) {
        this.updateCallback(`📄 Scraping page ${currentPage} (start=${startOffset})...`);

        // Navigate directly to the page with offset
        const pageUrl = `https://foorum.hinnavaatlus.ee/viewforum.php?f=3&topicdays=0&start=${startOffset}`;

        try {
          await this.page.goto(pageUrl, {
            waitUntil: "networkidle2",
            timeout: 30000,
          });

          // Wait for content to load
          await this.page.waitForSelector("table.forumline", {
            timeout: 10000,
          });
        } catch (error) {
          this.updateCallback(`⚠️ Failed to load page ${currentPage}: ${error.message}`);
          break;
        }

        // Get threads with "Videokaardid" category filter
        const videokaardidThreads = await this.getVideokaardidThreads();

        if (videokaardidThreads.length === 0) {
          this.updateCallback(`📭 No Videokaardid threads found on page ${currentPage}`);
        } else {
          this.updateCallback(`🎯 Found ${videokaardidThreads.length} Videokaardid threads on page ${currentPage}`);

          let gpusFoundOnPage = 0;

          // Process each Videokaardid thread
          for (const thread of videokaardidThreads) {
            if (this.processedThreads.has(thread.url)) {
              continue;
            }

            try {
              const found = await this.scrapeThread(thread);
              if (found) {
                gpusFoundOnPage++;
              }

              this.processedThreads.add(thread.url);

              // Small delay between threads
              await this.page.waitForTimeout(500);
            } catch (error) {
              this.updateCallback(`❌ Error processing thread "${thread.title}": ${error.message}`);
            }
          }

          this.updateCallback(`✅ Page ${currentPage}: Found ${gpusFoundOnPage} GPU listings`);
        }

        // Check if we should continue
        const allThreadsOnPage = await this.getAllThreadsCount();
        if (allThreadsOnPage < 25) {
          this.updateCallback(`📄 Page ${currentPage} has fewer threads, likely the last page`);
          break;
        }

        // Move to next page
        currentPage++;
        startOffset += increment; // Increment by 25

        // Brief pause between pages
        await this.page.waitForTimeout(1000);
      }

      this.updateCallback(`🏁 Scraping complete! Found ${this.gpuData.length} GPU listings`);

      return {
        success: true,
        data: this.gpuData,
        totalListings: this.gpuData.length,
        processedThreads: this.processedThreads.size,
        processedPages: currentPage
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

  async launchBrowser(headless) {
    this.updateCallback("🌐 Launching browser...");
    this.browser = await puppeteer.launch({
      headless,
      defaultViewport: null,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    this.page = await this.browser.newPage();
    this.page.setDefaultTimeout(30000);
  }

  async getVideokaardidThreads() {
    return await this.page.evaluate(() => {
      const threads = [];
      const rows = document.querySelectorAll("table.forumline tbody tr");

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];

        try {
          // Look for the category span (Videokaardid)
          const categorySpan = row.querySelector("td:nth-child(2) span.topictitle a span:nth-child(2)");

          if (categorySpan && categorySpan.textContent.trim() === "Videokaardid") {
            const threadLink = row.querySelector("td:nth-child(2) span.topictitle a");

            if (threadLink && threadLink.href) {
              const title = threadLink.textContent.trim();
              const url = threadLink.href;

              // Get location
              let location = null;
              const locationSpan = row.querySelector("td:nth-child(2) span.topictitle a span:nth-child(3)");
              if (locationSpan) {
                const locationText = locationSpan.textContent.trim();
                if (locationText && !locationText.includes("Videokaardid")) {
                  location = locationText.replace(/^Asukoht:?\s*/i, "").trim();
                }
              }

              // Get author
              let author = "Unknown";
              const authorLink = row.querySelector('a[href*="profile.php"]') ||
                                row.querySelector(".username") ||
                                row.querySelector("span.name a");
              if (authorLink) {
                author = authorLink.textContent.trim();
              }

              threads.push({
                title,
                url,
                author,
                location: location || null,
                category: "Videokaardid"
              });
            }
          }
        } catch (e) {
          console.warn("Error processing row:", e.message);
        }
      }

      return threads;
    });
  }

  async getAllThreadsCount() {
    return await this.page.evaluate(() => {
      const rows = document.querySelectorAll("table.forumline tbody tr");
      let threadCount = 0;
      for (let i = 3; i < rows.length; i++) {
        const row = rows[i];
        const titleLink = row.querySelector('a[href*="viewtopic.php"]');
        if (titleLink) {
          threadCount++;
        }
      }
      return threadCount;
    });
  }

  async scrapeThread(thread) {
    try {
      this.updateCallback(`🔍 Processing: ${thread.title.substring(0, 50)}...`);

      // Navigate to thread
      await this.page.goto(thread.url, {
        waitUntil: "networkidle2",
        timeout: 20000,
      });

      const threadData = await this.extractThreadData();
      const fullText = `${thread.title} ${threadData.content}`;

      // Extract all GPUs and their prices from the thread
      const gpuListings = this.extractAllGPUs(fullText);

      // Use location from thread listing if available
      let location = thread.location;
      if (!location) {
        location = this.extractLocation(fullText);
      }

      if (gpuListings.length === 0) {
        this.updateCallback(`⚠️ No GPUs found in: ${thread.title.substring(0, 30)}...`);
        return false;
      }

      // Handle multiple GPUs case
      if (gpuListings.length > 1) {
        // Create a single "Multiple GPUs" entry
        const gpuEntry = {
          id: this.generateId(thread.url) + "_multiple",
          model: "Multiple",
          brand: "Multiple",
          price: this.calculateAveragePrice(gpuListings),
          currency: gpuListings[0].currency,
          title: thread.title,
          url: thread.url,
          author: thread.author,
          location: location,
          scraped_at: new Date().toISOString(),
          multiple_gpus: gpuListings,
          gpu_count: gpuListings.length
        };

        this.gpuData.push(gpuEntry);
        this.updateCallback(`✅ Found Multiple GPUs (${gpuListings.length}): ${gpuListings.map(g => g.model).join(", ")}`);
      } else {
        // Single GPU
        const listing = gpuListings[0];
        const gpuEntry = {
          id: this.generateId(thread.url),
          model: listing.model,
          brand: this.detectBrand(listing.model),
          price: listing.price,
          currency: listing.currency,
          title: thread.title,
          url: thread.url,
          author: thread.author,
          location: location,
          scraped_at: new Date().toISOString()
        };

        this.gpuData.push(gpuEntry);
        this.updateCallback(`✅ Found: ${listing.model} - ${listing.price}${listing.currency}`);
      }

      return true;
    } catch (error) {
      this.updateCallback(`❌ Error scraping thread: ${error.message}`);
      return false;
    }
  }

  calculateAveragePrice(gpuListings) {
    const prices = gpuListings.map(gpu => gpu.price);
    return Math.round(prices.reduce((sum, price) => sum + price, 0) / prices.length);
  }

  extractAllGPUs(text) {
    const gpuListings = [];
    const upperText = text.toUpperCase();

    // Enhanced GPU patterns
    const patterns = [
      /RTX\s*40[5-9]0\s*(TI|SUPER)?/gi,
      /RTX\s*4060\s*(TI)?/gi,
      /RTX\s*4070\s*(TI|SUPER)?/gi,
      /RTX\s*4080\s*(SUPER)?/gi,
      /RTX\s*4090/gi,
      /RTX\s*30[5-9]0\s*(TI)?/gi,
      /RTX\s*3060\s*(TI)?/gi,
      /RTX\s*3070\s*(TI)?/gi,
      /RTX\s*3080\s*(TI)?/gi,
      /RTX\s*3090\s*(TI)?/gi,
      /RTX\s*20[6-8]0\s*(SUPER)?/gi,
      /GTX\s*16[5-6]0\s*(TI|SUPER)?/gi,
      /GTX\s*10[5-8]0\s*(TI)?/gi,
      /RX\s*7[0-9]00\s*(XT|XTX)?/gi,
      /RX\s*6[0-9]00\s*(XT|XTX)?/gi,
      /RX\s*5[0-9]00\s*(XT)?/gi,
      /ARC\s*A[0-9]{3,4}/gi
    ];

    // Find all unique GPU models
    const foundGPUs = new Set();
    for (const pattern of patterns) {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach(match => {
          const normalized = match.trim().replace(/\s+/g, " ").toUpperCase();
          foundGPUs.add(normalized);
        });
      }
    }

    // Extract prices
    const prices = this.extractAllPrices(text);

    if (foundGPUs.size === 0) {
      return [];
    }

    // Match GPUs with prices
    if (foundGPUs.size > 1 && prices.length > 1) {
      const gpuArray = Array.from(foundGPUs);

      for (let i = 0; i < gpuArray.length && i < prices.length; i++) {
        gpuListings.push({
          model: gpuArray[i],
          price: prices[i].price,
          currency: prices[i].currency
        });
      }

      // If more GPUs than prices, use first price for remaining
      if (gpuArray.length > prices.length) {
        for (let i = prices.length; i < gpuArray.length; i++) {
          gpuListings.push({
            model: gpuArray[i],
            price: prices[0].price,
            currency: prices[0].currency
          });
        }
      }
    } else if (foundGPUs.size >= 1 && prices.length >= 1) {
      const gpu = Array.from(foundGPUs)[0];
      const price = prices[0];

      gpuListings.push({
        model: gpu,
        price: price.price,
        currency: price.currency
      });
    }

    return gpuListings;
  }

  extractAllPrices(text) {
    const prices = [];
    const patterns = [
      { regex: /AH[:\s]*(\d+)/gi, currency: "AH" },
      { regex: /OK[:\s]*(\d+)/gi, currency: "OK" },
      { regex: /€\s*(\d+(?:[,\.]\d{1,2})?)/g, currency: "€" },
      { regex: /(\d+(?:[,\.]\d{1,2})?)\s*€/g, currency: "€" },
      { regex: /(\d+(?:[,\.]\d{1,2})?)\s*EUR/gi, currency: "€" },
      { regex: /HIND[:\s]*(\d+)/gi, currency: "€" },
      { regex: /(\d{2,4})\s*eurot?/gi, currency: "€" }
    ];

    for (const pattern of patterns) {
      const matches = [...text.matchAll(pattern.regex)];
      for (const match of matches) {
        let price = parseFloat(match[1].replace(",", "."));

        // Validate price range
        if (!isNaN(price) && price >= 50 && price <= 5000) {
          prices.push({
            price: Math.round(price),
            currency: pattern.currency
          });
        }
      }
    }

    // Remove duplicates
    const uniquePrices = prices.filter((price, index, self) =>
      index === self.findIndex(p => p.price === price.price && p.currency === price.currency)
    );

    return uniquePrices;
  }

  extractLocation(text) {
    if (!text) return null;

    const upperText = text.toUpperCase();

    // Estonian city names
    const cities = [
      "TALLINN", "TARTU", "NARVA", "PÄRNU", "KOHTLA-JÄRVE",
      "VILJANDI", "RAKVERE", "MAARDU", "KURESSAARE", "SILLAMÄE",
      "VALGA", "VÕRU", "JÕHVI", "KEILA", "HAAPSALU",
      "PAIDE", "ELVA", "SAUE", "PÕLVA", "TAPA"
    ];

    // Check for location keywords
    const locationPatterns = [
      /ASUKOHT[:\s]*([A-ZÄÖÜÕ\s,]+)/,
      /KOHT[:\s]*([A-ZÄÖÜÕ\s,]+)/,
      /LINN[:\s]*([A-ZÄÖÜÕ\s,]+)/
    ];

    // Try patterns first
    for (const pattern of locationPatterns) {
      const match = upperText.match(pattern);
      if (match) {
        const locationText = match[1].trim();
        for (const city of cities) {
          if (locationText.includes(city)) {
            return city.charAt(0) + city.slice(1).toLowerCase();
          }
        }
      }
    }

    // Direct city search
    for (const city of cities) {
      const cityPattern = new RegExp(`\\b${city}\\b`);
      if (cityPattern.test(upperText)) {
        return city.charAt(0) + city.slice(1).toLowerCase();
      }
    }

    return null;
  }

  async extractThreadData() {
    return await this.page.evaluate(() => {
      const contentSelectors = [
        ".postbody",
        'td.row1[valign="top"] span.postbody',
        ".post-content",
        "table.forumline td span.postbody"
      ];

      let content = "";
      for (const selector of contentSelectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
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

  generateId(url) {
    const threadId = url.split("t=")[1]?.split("&")[0] || Date.now();
    return `gpu_${threadId}_${Date.now()}`;
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
      this.updateCallback("🔒 Browser closed");
    }
  }
}

module.exports = GPUForumScraper;