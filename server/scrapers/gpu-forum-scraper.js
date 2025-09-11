// server/scrapers/gpu-forum-scraper.js - Fixed filtering and pagination
const puppeteer = require("puppeteer");

class GPUForumScraper {
  constructor(updateCallback = console.log) {
    this.updateCallback = updateCallback;
    this.browser = null;
    this.page = null;
    this.processedThreads = new Set();
    this.gpuData = [];
  }

  async scrape(username, password, options = {}) {
    const {
      maxPages = 10, // Increased default
      maxThreadsPerPage = 30,
      headless = true,
    } = options;

    try {
      this.updateCallback("🚀 Starting GPU Forum Scraper...");

      await this.launchBrowser(headless);
      await this.login(username, password);
      await this.navigateToSellSection();

      // Try to apply GPU filter
      const filterApplied = await this.applyGPUFilter();

      if (!filterApplied) {
        this.updateCallback(
          "⚠️ Filter failed, will scan all listings and filter by content",
        );
      }

      await this.scrapeAllPages(maxPages, maxThreadsPerPage);

      this.updateCallback(
        `✅ Scraping complete! Found ${this.gpuData.length} GPU listings`,
      );

      return {
        success: true,
        data: this.gpuData,
        totalListings: this.gpuData.length,
        processedThreads: this.processedThreads.size,
      };
    } catch (error) {
      this.updateCallback(`❌ Scraper error: ${error.message}`);
      return {
        success: false,
        error: error.message,
        data: this.gpuData,
        partialResults: this.gpuData.length > 0,
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

  async login(username, password) {
    this.updateCallback("🔐 Logging in to forum...");

    await this.page.goto("https://auth.hinnavaatlus.ee/ui/login", {
      waitUntil: "networkidle2",
      timeout: 30000,
    });

    await this.page.waitForSelector('input[name="identifier"]', {
      timeout: 10000,
    });
    await this.page.type('input[name="identifier"]', username);
    await this.page.type('input[name="password"]', password);

    // Use the correct submit button selector
    await this.page.waitForSelector(
      'body > div > section > div > div > div > form:nth-child(5) > button[type="submit"]',
    );
    await this.page.click(
      'body > div > section > div > div > div > form:nth-child(5) > button[type="submit"]',
    );

    await this.page.waitForNavigation({
      waitUntil: "networkidle2",
      timeout: 30000,
    });

    const currentUrl = this.page.url();
    if (currentUrl.includes("login")) {
      throw new Error("Login failed - still on login page");
    }

    this.updateCallback("✅ Login successful!");
  }

  async navigateToSellSection() {
    this.updateCallback("📱 Navigating to sell section...");

    await this.page.goto("https://foorum.hinnavaatlus.ee/viewforum.php?f=3", {
      waitUntil: "networkidle2",
      timeout: 30000,
    });

    await this.page.waitForSelector("table.forumline", { timeout: 10000 });
  }

  async applyGPUFilter() {
    this.updateCallback("🔍 Attempting to apply GPU filter...");

    try {
      // Method 1: Try using the filter dropdown
      const filterLinkExists = await this.page.$("#hvcatlink");

      if (filterLinkExists) {
        // Click filter link
        await this.page.click("#hvcatlink");
        this.updateCallback("Clicked filter link");

        // Wait a moment for dropdown to be ready
        await this.page.setTimeout(1000);

        // Check if dropdown is visible
        const dropdownVisible = await this.page.evaluate(() => {
          const dropdown = document.querySelector("#forum_cat");
          return dropdown && dropdown.offsetParent !== null;
        });

        if (dropdownVisible) {
          // Select Videokaardid (option value 22)
          await this.page.setTimeout(5000);
          await this.page.select("#forum_cat", "22");
          this.updateCallback("Selected Videokaardid option");
        }
      }

      // Check if we're on a filtered page
      const pageContent = await this.page.content();
      if (
        pageContent.includes("Videokaardid") ||
        this.page.url().includes("c=22")
      ) {
        this.updateCallback("✅ GPU filter applied via direct URL");
        return true;
      }

      return false;
    } catch (error) {
      this.updateCallback(`⚠️ Filter error: ${error.message}`);
      return false;
    }
  }

  async scrapeAllPages(maxPages, maxThreadsPerPage) {
    let currentPage = 1;
    let consecutiveEmptyPages = 0;
    const maxEmptyPages = 7; // Stop after 2 consecutive pages with no GPUs

    while (currentPage <= maxPages) {
      this.updateCallback(`📄 Scraping page ${currentPage}/${maxPages}...`);

      const threadLinks = await this.getThreadLinks();

      if (threadLinks.length === 0) {
        this.updateCallback(`No threads found on page ${currentPage}`);
        break;
      }

      this.updateCallback(
        `Found ${threadLinks.length} threads on page ${currentPage}`,
      );

      let gpusFoundOnPage = 0;
      let processedCount = 0;

      for (const thread of threadLinks) {
        if (processedCount >= maxThreadsPerPage) break;
        if (this.processedThreads.has(thread.url)) continue;

        const foundGPU = await this.scrapeThread(thread);
        if (foundGPU) {
          gpusFoundOnPage++;
        }

        this.processedThreads.add(thread.url);
        processedCount++;

        // Small delay between threads
        await this.page.waitForTimeout(300);
      }

      this.updateCallback(
        `Page ${currentPage}: Found ${gpusFoundOnPage} GPU listings`,
      );

      // Track consecutive empty pages
      if (gpusFoundOnPage === 0) {
        consecutiveEmptyPages++;
        if (consecutiveEmptyPages >= maxEmptyPages) {
          this.updateCallback(
            `No GPUs found in ${maxEmptyPages} consecutive pages, stopping scan`,
          );
          break;
        }
      } else {
        consecutiveEmptyPages = 0;
      }

      // Try to go to next page
      const hasNext = await this.navigateToNextPage();
      if (!hasNext) {
        this.updateCallback("No more pages available");
        break;
      }

      currentPage++;
    }

    this.updateCallback(
      `Processed ${currentPage} pages, found ${this.gpuData.length} GPU listings`,
    );
  }

  async getThreadLinks() {
    return await this.page.evaluate(() => {
      const threads = [];

      // Try multiple table selectors
      let rows = document.querySelectorAll("table.forumline tr");

      if (rows.length === 0) {
        rows = document.querySelectorAll("table tr");
      }

      // Skip header rows (usually first 3)
      for (let i = 3; i < rows.length; i++) {
        const row = rows[i];

        // Find the title link
        const titleLink = row.querySelector('a[href*="viewtopic.php"]');

        if (titleLink && titleLink.href) {
          const title = titleLink.textContent.trim();
          const url = titleLink.href;

          // Get author
          let author = "Unknown";
          const authorLink =
            row.querySelector('a[href*="profile.php"]') ||
            row.querySelector(".username") ||
            row.querySelector("span.name a");
          if (authorLink) {
            author = authorLink.textContent.trim();
          }

          threads.push({ title, url, author });
        }
      }

      return threads;
    });
  }

  async scrapeThread(thread) {
    try {
      // Quick pre-filter: Check if title might contain GPU info
      const titleHasGPU = this.quickGPUCheck(thread.title);

      if (!titleHasGPU) {
        // Skip threads that clearly don't have GPUs in title
        this.updateCallback(
          `⏭️ Skipping non-GPU thread: ${thread.title.substring(0, 30)}`,
        );
        return false;
      }

      this.updateCallback(`🔍 Processing: ${thread.title.substring(0, 50)}...`);

      await this.page.goto(thread.url, {
        waitUntil: "networkidle2",
        timeout: 20000,
      });

      const threadData = await this.extractThreadData();
      const fullText = `${thread.title} ${threadData.content}`;

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
          scraped_at: new Date().toISOString(),
        };

        this.gpuData.push(listing);
        this.updateCallback(
          `✅ Found: ${gpuModel} - ${priceData.price}${priceData.currency}`,
        );

        await this.page.goBack({
          waitUntil: "networkidle2",
          timeout: 20000,
        });

        return true;
      } else {
        this.updateCallback(
          `⚠️ No GPU/price found in: ${thread.title.substring(0, 30)}`,
        );

        await this.page.goBack({
          waitUntil: "networkidle2",
          timeout: 20000,
        });

        return false;
      }
    } catch (error) {
      this.updateCallback(`❌ Error scraping thread: ${error.message}`);

      // Try to recover by going back to forum list
      try {
        const currentUrl = this.page.url();
        if (!currentUrl.includes("viewforum.php")) {
          await this.page.goto(
            "https://foorum.hinnavaatlus.ee/viewforum.php?f=3&c=22",
            {
              waitUntil: "networkidle2",
            },
          );
        }
      } catch (navError) {
        // Ignore navigation error
      }

      return false;
    }
  }

  quickGPUCheck(text) {
    const upperText = text.toUpperCase();
    const gpuKeywords = [
      "RTX",
      "GTX",
      "RX",
      "RADEON",
      "GEFORCE",
      "ARC",
      "VIDEOKAART",
      "GRAAFIKAKAART",
      "GPU",
      "1060",
      "1070",
      "1080",
      "2060",
      "2070",
      "2080",
      "3060",
      "3070",
      "3080",
      "3090",
      "4060",
      "4070",
      "4080",
      "4090",
      "5700",
      "6600",
      "6700",
      "6800",
      "6900",
      "7600",
      "7700",
      "7800",
      "7900",
    ];

    return gpuKeywords.some((keyword) => upperText.includes(keyword));
  }

  async extractThreadData() {
    return await this.page.evaluate(() => {
      const contentSelectors = [
        ".postbody",
        'td.row1[valign="top"] span.postbody',
        ".post-content",
        "table.forumline td span.postbody",
      ];

      let content = "";
      for (const selector of contentSelectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          // Get first post content
          content = elements[0].textContent || elements[0].innerText || "";
          if (content.length > 50) break;
        }
      }

      return {
        content: content.trim(),
        title: document.title,
      };
    });
  }

  extractGPUModel(text) {
    const cleanText = text.toUpperCase().replace(/[^\w\s]/g, " ");

    const patterns = [
      // NVIDIA patterns
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
      /GTX\s*9[6-8]0/gi,

      // AMD patterns
      /RX\s*7[0-9]00\s*(XT|XTX)?/gi,
      /RX\s*6[0-9]00\s*(XT|XTX)?/gi,
      /RX\s*5[0-9]00\s*(XT)?/gi,
      /RADEON\s*\d{4}/gi,

      // Intel patterns
      /ARC\s*A[0-9]{3,4}/gi,
      /INTEL\s*ARC\s*A[0-9]{3,4}/gi,
    ];

    for (const pattern of patterns) {
      const matches = text.match(pattern);
      if (matches && matches.length > 0) {
        // Return the first match, cleaned up
        let model = matches[0].trim().replace(/\s+/g, " ");

        // Normalize model names
        model = model.replace(/\s+/, " ");

        return model;
      }
    }

    return null;
  }

  extractPrice(text) {
    const patterns = [
      { regex: /AH[:\s]*(\d+)/gi, currency: "AH" },
      { regex: /OK[:\s]*(\d+)/gi, currency: "OK" },
      { regex: /€\s*(\d+(?:[,\.]\d{1,2})?)/g, currency: "€" },
      { regex: /(\d+(?:[,\.]\d{1,2})?)\s*€/g, currency: "€" },
      { regex: /(\d+(?:[,\.]\d{1,2})?)\s*EUR/gi, currency: "€" },
      { regex: /HIND[:\s]*(\d+)/gi, currency: "€" },
      { regex: /(\d{2,4})\s*eurot?/gi, currency: "€" },
    ];

    for (const pattern of patterns) {
      const matches = [...text.matchAll(pattern.regex)];
      if (matches.length > 0) {
        for (const match of matches) {
          let price = parseFloat(match[1].replace(",", "."));

          // Validate price range (GPUs typically 50-5000)
          if (!isNaN(price) && price >= 50 && price <= 5000) {
            return {
              price: Math.round(price),
              currency: pattern.currency,
            };
          }
        }
      }
    }

    return null;
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

  async navigateToNextPage() {
    try {
      // Multiple selectors for next page link
      const nextPageSelectors = [
        'a[title="Järgmine lehekülg"]',
        'a:contains("Järgmine")',
        'span.nav a:contains("Järgmine")',
        'a[href*="start="][href*="f=3"]',
      ];

      let nextPageLink = null;

      for (const selector of nextPageSelectors) {
        try {
          nextPageLink = await this.page.$(selector);
          if (nextPageLink) break;
        } catch (e) {
          // Try next selector
        }
      }

      // If no specific next link, try finding pagination links
      if (!nextPageLink) {
        const paginationLinks = await this.page.evaluate(() => {
          const links = Array.from(
            document.querySelectorAll('a[href*="start="]'),
          );

          // Find the next page number
          const currentUrl = window.location.href;
          const currentStart =
            parseInt(
              new URLSearchParams(window.location.search).get("start"),
            ) || 0;

          // Look for a link with start value higher than current
          for (const link of links) {
            const href = link.href;
            const linkStart =
              parseInt(
                new URLSearchParams(new URL(href).search).get("start"),
              ) || 0;

            if (linkStart > currentStart) {
              return link.href;
            }
          }

          return null;
        });

        if (paginationLinks) {
          await this.page.goto(paginationLinks, {
            waitUntil: "networkidle2",
            timeout: 30000,
          });
          return true;
        }
      }

      if (nextPageLink) {
        await nextPageLink.click();
        await this.page.waitForNavigation({
          waitUntil: "networkidle2",
          timeout: 30000,
        });
        return true;
      }

      return false;
    } catch (error) {
      this.updateCallback(`Navigation error: ${error.message}`);
      return false;
    }
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
