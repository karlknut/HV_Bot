// server/gpu-tracker.js - Enhanced with proper navigation and filtering
const puppeteer = require("puppeteer");

class GPUPriceTracker {
  constructor(updateCallback = console.log) {
    this.updateCallback = updateCallback;
    this.gpuData = [];
    this.processedThreads = new Set();
  }

  // Enhanced GPU model extraction with AI-like pattern matching
  async extractGPUModel(text) {
    const cleanText = text.toUpperCase().replace(/[^\w\s]/g, " ");

    // Enhanced patterns for better GPU detection
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

      // AMD RX 7000 series
      /RX\s*7[0-9]00\s*(XT|XTX)?/gi,

      // AMD RX 6000 series
      /RX\s*6[0-9]00\s*(XT|XTX)?/gi,

      // AMD RX 5000 series
      /RX\s*5[0-9]00\s*(XT)?/gi,

      // Intel Arc
      /ARC\s*A[0-9]{3,4}/gi,

      // Generic patterns
      /RTX\s*\d{4}\s*(TI|SUPER|XTX)?/gi,
      /GTX\s*\d{4}\s*(TI|SUPER)?/gi,
      /RX\s*\d{4}\s*(XT|XTX)?/gi,
    ];

    for (const pattern of patterns) {
      const matches = cleanText.match(pattern);
      if (matches) {
        const bestMatch = matches.sort((a, b) => b.length - a.length)[0];
        return bestMatch.trim().replace(/\s+/g, " ");
      }
    }

    return this.detectGPUFromContext(cleanText);
  }

  // AI-like contextual GPU detection
  detectGPUFromContext(text) {
    const gpuKeywords = [
      "VIDEOKAART",
      "GRAAFIKAKAART",
      "GRAPHICS",
      "VIDEO",
      "GPU",
    ];
    const hasGPUContext = gpuKeywords.some((keyword) => text.includes(keyword));

    if (!hasGPUContext) return null;

    const modelPatterns = [
      /\b(RTX|GTX|RX|ARC)\s*\d{3,4}/gi,
      /\b\d{4}\s*(TI|XT|XTX|SUPER)/gi,
    ];

    for (const pattern of modelPatterns) {
      const match = text.match(pattern);
      if (match) {
        return match[0].trim().replace(/\s+/g, " ");
      }
    }

    return null;
  }

  // Enhanced price extraction with multiple currency support
  extractPrice(text) {
    const pricePatterns = [
      /AH[:\s]*(\d+)/gi,
      /OK[:\s]*(\d+)/gi,
      /€\s*(\d+(?:[,\.]\d{2})?)/g,
      /(\d+(?:[,\.]\d{2})?)\s*€/g,
      /(\d+(?:[,\.]\d{2})?)\s*EUR/gi,
      /(?:HIND|PRICE|COST)[:\s]*(\d+)/gi,
      /(\d+)[:\s]*(?:EURO|EUR)/gi,
    ];

    for (const pattern of pricePatterns) {
      const matches = [...text.matchAll(pattern)];
      if (matches.length > 0) {
        const match = matches[0];
        let price = parseFloat(match[1].replace(",", "."));

        if (isNaN(price)) continue;

        let currency = "€";
        if (pattern.source.includes("AH")) currency = "AH";
        else if (pattern.source.includes("OK")) currency = "OK";

        if (price >= 50 && price <= 5000) {
          return { price: Math.round(price), currency };
        }
      }
    }

    return null;
  }

  // Scrape individual thread content for better detection
  async scrapeThreadContent(page, threadUrl, maxRetries = 2) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        await page.goto(threadUrl, {
          waitUntil: "networkidle2",
          timeout: 15000,
        });

        const threadData = await page.evaluate(() => {
          const contentSelectors = [
            ".post-content",
            ".postbody",
            'td.row1[valign="top"]',
            ".message",
            "table.forumline tr td",
          ];

          let content = "";
          for (const selector of contentSelectors) {
            const element = document.querySelector(selector);
            if (element) {
              content = element.innerText || element.textContent || "";
              if (content.length > 50) break;
            }
          }

          const title = document.title || "";

          return {
            content: content.trim(),
            title: title.trim(),
          };
        });

        return threadData;
      } catch (error) {
        console.warn(
          `Attempt ${attempt + 1} failed for ${threadUrl}:`,
          error.message,
        );
        if (attempt === maxRetries - 1) {
          return { content: "", title: "" };
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }

  async scrapeGPUListings(page, shouldScrapeContent = true) {
    const listings = await page.evaluate(() => {
      const threads = [];

      const tableSelectors = [
        "table.forumline tbody tr",
        "table.forumline tr",
        ".forum-table tr",
        "tr",
      ];

      let rows = [];
      for (const selector of tableSelectors) {
        rows = document.querySelectorAll(selector);
        if (rows.length > 3) break;
      }

      rows.forEach((row, index) => {
        if (index < 3) return;

        try {
          const titleLink =
            row.querySelector('a[href*="viewtopic.php"]') ||
            row.querySelector("a.topictitle") ||
            row.querySelector("a");

          if (
            titleLink &&
            titleLink.href &&
            titleLink.href.includes("viewtopic.php")
          ) {
            const title = titleLink.textContent.trim();
            const url = titleLink.href;

            const cells = row.querySelectorAll("td");
            let author = "Unknown";
            let replies = 0;

            for (let i = 0; i < cells.length; i++) {
              const cell = cells[i];
              const authorLink =
                cell.querySelector("span.name a") ||
                cell.querySelector('a[href*="profile.php"]') ||
                cell.querySelector(".username");
              if (authorLink) {
                author = authorLink.textContent.trim();
                break;
              }
            }

            const repliesCell = cells[2] || cells[3];
            if (repliesCell) {
              const repliesText = repliesCell.textContent.trim();
              replies = parseInt(repliesText) || 0;
            }

            threads.push({
              title,
              url,
              author,
              replies,
            });
          }
        } catch (e) {
          console.warn("Error processing row:", e.message);
        }
      });

      return threads;
    });

    let processed = 0;
    for (const listing of listings) {
      try {
        if (this.processedThreads.has(listing.url)) continue;

        this.updateCallback(`Processing: ${listing.title.substring(0, 50)}...`);

        let gpuModel = await this.extractGPUModel(listing.title);
        let priceData = this.extractPrice(listing.title);

        if (
          (!gpuModel || !priceData) &&
          shouldScrapeContent &&
          processed < 20
        ) {
          this.updateCallback(
            `Deep scanning thread: ${listing.title.substring(0, 30)}...`,
          );

          const threadData = await this.scrapeThreadContent(page, listing.url);
          const fullText = `${listing.title} ${threadData.title} ${threadData.content}`;

          if (!gpuModel) {
            gpuModel = await this.extractGPUModel(fullText);
          }

          if (!priceData) {
            priceData = this.extractPrice(fullText);
          }

          processed++;
        }

        if (gpuModel && priceData) {
          this.gpuData.push({
            id: this.generateId(listing.url),
            model: gpuModel,
            brand: this.extractBrand(gpuModel),
            price: priceData.price,
            currency: priceData.currency,
            title: listing.title,
            url: listing.url,
            author: listing.author,
            replies: listing.replies,
            scraped_at: new Date().toISOString(),
            source: "forum",
          });

          this.updateCallback(
            `✓ Found: ${gpuModel} - ${priceData.price}${priceData.currency}`,
          );
        }

        this.processedThreads.add(listing.url);
      } catch (error) {
        console.warn(
          `Error processing listing "${listing.title}":`,
          error.message,
        );
      }
    }

    return listings.length;
  }

  extractBrand(model) {
    if (!model) return "Unknown";

    const modelUpper = model.toUpperCase();

    if (
      modelUpper.includes("RTX") ||
      modelUpper.includes("GTX") ||
      modelUpper.includes("GEFORCE")
    ) {
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
    return url.split("=").pop() + "_" + Date.now();
  }

  async run(username, password, userId) {
    let browser;

    try {
      this.updateCallback("🚀 Starting Enhanced GPU Price Tracker...");

      browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });

      const page = await browser.newPage();

      // Login
      this.updateCallback("🔐 Logging in...");
      await this.login(page, username, password);

      // Navigate to the forum's sell section
      this.updateCallback("📱 Navigating to forum sell section...");
      await page.goto("https://foorum.hinnavaatlus.ee/viewforum.php?f=3", {
        waitUntil: "networkidle2",
        timeout: 30000,
      });

      // Apply GPU filter - FIXED NAVIGATION
      this.updateCallback("🔍 Applying GPU filter...");
      try {
        // Wait for and click the filter link
        await page.waitForSelector("#hvcatlink", { timeout: 10000 });
        await page.click("#hvcatlink");
        this.updateCallback("Clicked filter link");

        // Wait for dropdown to appear
        await page.waitForSelector("#forum_cat", { timeout: 5000 });
        this.updateCallback("Dropdown appeared");

        // Select Videokaardid option (option 22)
        await page.select("#forum_cat", "22");
        this.updateCallback("Selected Videokaardid option");

        // Wait a moment for the selection to register
        await page.waitForTimeout(1000);

        // Click the search button
        const searchButton = await page.waitForSelector(
          "#hvcatform > table > tbody > tr:nth-child(1) > td.row2 > input",
          { timeout: 5000 },
        );
        if (searchButton) {
          await searchButton.click();
          this.updateCallback("Clicked search button");
        } else {
          // Try alternative selector for search button
          const altSearchButton =
            (await page.$('input[value="Otsi"]')) ||
            (await page.$('input[type="submit"]'));
          if (altSearchButton) {
            await altSearchButton.click();
            this.updateCallback("Clicked search button (alternative)");
          } else {
            throw new Error("Could not find search button");
          }
        }

        // Wait for the filtered results page to load
        await page.waitForNavigation({
          waitUntil: "networkidle2",
          timeout: 30000,
        });

        this.updateCallback("✅ Successfully filtered to GPU-only listings");
      } catch (filterError) {
        this.updateCallback(
          `⚠️ Filter failed: ${filterError.message}, proceeding with all listings...`,
        );
        // Continue without filter - will still work but less targeted
      }

      let pageNum = 1;
      let hasNextPage = true;
      const maxPages = 5;

      while (hasNextPage && pageNum <= maxPages) {
        this.updateCallback(`📄 Scraping page ${pageNum}/${maxPages}...`);

        const listingsCount = await this.scrapeGPUListings(page, pageNum <= 2);
        this.updateCallback(
          `✅ Found ${listingsCount} listings on page ${pageNum}`,
        );

        // Check for next page
        try {
          const nextPageLink =
            (await page.$('a[title="Järgmine lehekülg"]')) ||
            (await page.$('a:contains("Järgmine")')) ||
            (await page.$('a[href*="start="]'));

          if (nextPageLink && pageNum < maxPages) {
            await nextPageLink.click();
            await page.waitForNavigation({
              waitUntil: "networkidle2",
              timeout: 30000,
            });
            pageNum++;
          } else {
            hasNextPage = false;
          }
        } catch (navError) {
          this.updateCallback(
            `⚠️ Navigation failed on page ${pageNum}, stopping...`,
          );
          hasNextPage = false;
        }
      }

      this.updateCallback(
        `🎉 Scraping complete! Found ${this.gpuData.length} GPU listings`,
      );

      return {
        success: true,
        data: this.gpuData,
        totalListings: this.gpuData.length,
        timestamp: new Date().toISOString(),
        processedPages: pageNum - 1,
      };
    } catch (error) {
      this.updateCallback(`❌ Error: ${error.message}`);
      return {
        success: false,
        error: error.message,
        data: this.gpuData,
        partialResults: this.gpuData.length > 0,
      };
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  async login(page, username, password) {
    await page.goto("https://auth.hinnavaatlus.ee/ui/login", {
      waitUntil: "networkidle2",
      timeout: 30000,
    });

    await page.waitForSelector('input[name="identifier"]', { timeout: 10000 });
    await page.type('input[name="identifier"]', username);
    await page.type('input[name="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForNavigation({
      waitUntil: "networkidle2",
      timeout: 30000,
    });
  }
}

// Price Alert System
class GPUPriceAlertSystem {
  constructor(db) {
    this.db = db;
  }

  async checkAlerts() {
    try {
      const triggeredAlerts = await this.db.checkPriceAlerts();

      if (triggeredAlerts.length > 0) {
        console.log(`🔔 ${triggeredAlerts.length} price alerts triggered`);

        for (const trigger of triggeredAlerts) {
          console.log(
            `Alert for ${trigger.username}: ${trigger.listing.model} at ${trigger.listing.price}${trigger.listing.currency} (target: ${trigger.alert.target_price}${trigger.alert.currency})`,
          );
        }
      }

      return triggeredAlerts;
    } catch (error) {
      console.error("Error checking price alerts:", error);
      return [];
    }
  }

  async createAlert(
    userId,
    gpuModel,
    targetPrice,
    currency = "€",
    alertType = "below",
  ) {
    return await this.db.createPriceAlert(userId, {
      gpuModel,
      targetPrice,
      currency,
      alertType,
    });
  }

  async getUserAlerts(userId) {
    return await this.db.getUserPriceAlerts(userId);
  }
}

module.exports = { GPUPriceTracker, GPUPriceAlertSystem };
