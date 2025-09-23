// server/scrapers/gpu-forum-scraper.js - Enhanced version with category filtering and multiple GPU support
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
    const { maxPages = 20, headless = false } = options; // Changed to false for debugging

    try {
      this.updateCallback("🚀 Starting GPU Forum Scraper...");

      await this.launchBrowser(headless);

      // Login first
      await this.login(username, password);

      this.updateCallback("📄 Navigating to forum sell section...");

      // Go to the sell section
      await this.page.goto("https://foorum.hinnavaatlus.ee/viewforum.php?f=3", {
        waitUntil: "networkidle2",
        timeout: 30000,
      });

      // Start scanning pages
      let currentPage = 1;
      let hasMorePages = true;

      while (hasMorePages && currentPage <= maxPages) {
        this.updateCallback(`📄 Scanning page ${currentPage}...`);

        // Get all Videokaardid threads on this page
        const videokaardidThreads = await this.getVideokaardidThreads();

        this.updateCallback(
          `🎯 Found ${videokaardidThreads.length} Videokaardid threads on page ${currentPage}`,
        );

        // Process each Videokaardid thread
        for (let i = 0; i < videokaardidThreads.length; i++) {
          const thread = videokaardidThreads[i];

          if (this.processedThreads.has(thread.url)) {
            continue;
          }

          this.updateCallback(
            `🔍 Processing thread ${i + 1}/${videokaardidThreads.length}: ${thread.title.substring(0, 40)}...`,
          );

          try {
            const found = await this.scrapeThread(thread);
            if (found) {
              this.updateCallback(
                `✅ Found GPU(s) in: ${thread.title.substring(0, 30)}...`,
              );
            }

            this.processedThreads.add(thread.url);

            // Small delay between threads
            await this.page.waitForTimeout(1000);
          } catch (error) {
            this.updateCallback(`⚠️ Error in thread: ${error.message}`);
          }
        }

        // Try to go to next page
        hasMorePages = await this.goToNextPage();
        if (hasMorePages) {
          currentPage++;
          await this.page.waitForTimeout(2000); // Wait before processing next page
        }
      }

      this.updateCallback(
        `🏁 Scraping complete! Found ${this.gpuData.length} GPU listings across ${currentPage} pages`,
      );

      return {
        success: true,
        data: this.gpuData,
        totalListings: this.gpuData.length,
        processedThreads: this.processedThreads.size,
        processedPages: currentPage,
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
    await this.page.waitForSelector("input[name=password]", {
      timeout: 10000,
    });
    await this.page.type('input[name="password"]', password);

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

  async getVideokaardidThreads() {
    // Extract threads marked as Videokaardid from the current page
    return await this.page.evaluate(() => {
      const threads = [];

      // Get all forum rows
      const rows = document.querySelectorAll("table.forumline tbody tr");

      for (let i = 3; i < rows.length; i++) {
        // Skip header rows
        const row = rows[i];

        try {
          // Look for the category indicator
          const categoryElements = row.querySelectorAll("span.topictitle span");
          let isVideokaardid = false;

          for (const elem of categoryElements) {
            if (elem.textContent.trim() === "Videokaardid") {
              isVideokaardid = true;
              break;
            }
          }

          if (isVideokaardid) {
            // Get the thread link
            const threadLink = row.querySelector("span.topictitle a");

            if (threadLink && threadLink.href) {
              const title = threadLink.textContent.trim();
              const url = threadLink.href;

              // Get location if available
              let location = null;
              const locationElements = row.querySelectorAll(
                "span.topictitle span",
              );
              for (const elem of locationElements) {
                const text = elem.textContent.trim();
                if (text && !text.includes("Videokaardid") && text.length > 2) {
                  location = text.replace(/^Asukoht:?\s*/i, "").trim();
                  break;
                }
              }

              // Get author
              let author = "Unknown";
              const authorCell = row.cells[3]; // Usually the 4th cell
              if (authorCell) {
                const authorLink = authorCell.querySelector("a");
                if (authorLink) {
                  author = authorLink.textContent.trim();
                }
              }

              threads.push({
                title,
                url,
                author,
                location,
                category: "Videokaardid",
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

  async goToNextPage() {
    try {
      // Look for next page link
      const hasNextPage = await this.page.evaluate(() => {
        const nextLinks = document.querySelectorAll(
          'a[title="Järgmine lehekülg"], a.nav:contains("Järgmine")',
        );
        for (const link of nextLinks) {
          if (link && !link.classList.contains("disabled")) {
            link.click();
            return true;
          }
        }

        // Alternative: look for numbered page links
        const pageLinks = document.querySelectorAll("span.gensmall b a");
        for (const link of pageLinks) {
          const pageNum = parseInt(link.textContent);
          if (!isNaN(pageNum) && link.parentElement.nextElementSibling) {
            const nextLink =
              link.parentElement.nextElementSibling.querySelector("a");
            if (nextLink) {
              nextLink.click();
              return true;
            }
          }
        }

        return false;
      });

      if (hasNextPage) {
        await this.page.waitForNavigation({
          waitUntil: "networkidle2",
          timeout: 30000,
        });
        return true;
      }

      return false;
    } catch (error) {
      this.updateCallback("No more pages available");
      return false;
    }
  }

  async scrapeThread(thread) {
    try {
      // Navigate to the thread
      await this.page.goto(thread.url, {
        waitUntil: "networkidle2",
        timeout: 20000,
      });

      // Extract thread content
      const threadData = await this.extractThreadData();
      const fullText = `${thread.title} ${threadData.content}`;

      // Extract GPUs and prices
      const gpuListings = this.extractAllGPUs(fullText);

      if (gpuListings.length === 0) {
        return false;
      }

      // Use location from thread or try to extract from content
      let location = thread.location;
      if (!location) {
        location = this.extractLocation(fullText);
      }

      // Save GPU data
      if (gpuListings.length > 1) {
        // Multiple GPUs in one listing
        const avgPrice = Math.round(
          gpuListings.reduce((sum, gpu) => sum + gpu.price, 0) /
            gpuListings.length,
        );

        this.gpuData.push({
          id: this.generateId(thread.url) + "_multiple",
          model: "Multiple",
          brand: "Multiple",
          price: avgPrice,
          currency: gpuListings[0].currency,
          title: thread.title,
          url: thread.url,
          author: thread.author,
          location: location,
          scraped_at: new Date().toISOString(),
          multiple_gpus: gpuListings,
          gpu_count: gpuListings.length,
        });

        this.updateCallback(
          `✅ Found ${gpuListings.length} GPUs: ${gpuListings.map((g) => g.model).join(", ")}`,
        );
      } else {
        // Single GPU
        const gpu = gpuListings[0];

        this.gpuData.push({
          id: this.generateId(thread.url),
          model: gpu.model,
          brand: this.detectBrand(gpu.model),
          price: gpu.price,
          currency: gpu.currency,
          title: thread.title,
          url: thread.url,
          author: thread.author,
          location: location,
          scraped_at: new Date().toISOString(),
        });

        this.updateCallback(
          `✅ Found: ${gpu.model} - ${gpu.price}${gpu.currency}`,
        );
      }

      return true;
    } catch (error) {
      this.updateCallback(`❌ Error scraping thread: ${error.message}`);
      return false;
    }
  }

  calculateAveragePrice(gpuListings) {
    const prices = gpuListings.map((gpu) => gpu.price);
    return Math.round(
      prices.reduce((sum, price) => sum + price, 0) / prices.length,
    );
  }

  extractAllGPUs(text) {
    const gpuListings = [];
    const upperText = text.toUpperCase();

    // Enhanced GPU patterns for better detection
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
      /ARC\s*A[0-9]{3,4}/gi,

      // Generic patterns
      /RTX\s*\d{4}\s*(TI|SUPER|XTX)?/gi,
      /GTX\s*\d{4}\s*(TI|SUPER)?/gi,
      /RX\s*\d{4}\s*(XT|XTX)?/gi,
    ];

    // Find all unique GPU models
    const foundGPUs = new Set();
    for (const pattern of patterns) {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach((match) => {
          const normalized = match.trim().replace(/\s+/g, " ").toUpperCase();
          foundGPUs.add(normalized);
        });
      }
    }

    // Extract prices for each GPU
    const prices = this.extractAllPrices(text);

    if (foundGPUs.size === 0 || prices.length === 0) {
      return [];
    }

    const gpuArray = Array.from(foundGPUs);

    // If we have multiple GPUs and multiple prices, try to match them
    if (gpuArray.length === 1 && prices.length >= 1) {
      // Single GPU, take first valid price
      gpuListings.push({
        model: gpuArray[0],
        price: prices[0].price,
        currency: prices[0].currency,
      });
    } else if (gpuArray.length > 1 && prices.length >= gpuArray.length) {
      // Multiple GPUs with enough prices
      for (let i = 0; i < gpuArray.length; i++) {
        gpuListings.push({
          model: gpuArray[i],
          price: prices[i].price,
          currency: prices[i].currency,
        });
      }
    } else if (gpuArray.length > 1 && prices.length > 0) {
      // Multiple GPUs but fewer prices - use first price for all
      const price = prices[0];
      for (const gpu of gpuArray) {
        gpuListings.push({
          model: gpu,
          price: price.price,
          currency: price.currency,
        });
      }
    }

    return gpuListings;
  }

  extractAllPrices(text) {
    const prices = [];
    const patterns = [
      { regex: /MÜÜK[:\s]*(\d+)/gi, currency: "€" },
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
      for (const match of matches) {
        let price = parseFloat(match[1].replace(",", "."));

        // Validate price range (GPUs typically 50-5000)
        if (!isNaN(price) && price >= 50 && price <= 5000) {
          prices.push({
            price: Math.round(price),
            currency: pattern.currency,
          });
        }
      }
    }

    // Remove duplicate prices (same price and currency)
    const uniquePrices = [];
    const seen = new Set();

    for (const price of prices) {
      const key = `${price.price}-${price.currency}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniquePrices.push(price);
      }
    }

    return uniquePrices;
  }

  extractLocation(text) {
    if (!text) return null;

    const upperText = text.toUpperCase();

    // Estonian city names
    const cities = [
      "TALLINN",
      "TARTU",
      "NARVA",
      "PÄRNU",
      "KOHTLA-JÄRVE",
      "VILJANDI",
      "RAKVERE",
      "MAARDU",
      "KURESSAARE",
      "SILLAMÄE",
      "VALGA",
      "VÕRU",
      "JÕHVI",
      "KEILA",
      "HAAPSALU",
      "PAIDE",
      "ELVA",
      "SAUE",
      "PÕLVA",
      "TAPA",
      "JÕGEVA",
      "RAPLA",
      "KIVIÕLI",
      "TÜRI",
      "PÕLTSAMAA",
      "KADRINA",
      "SINDI",
      "PALDISKI",
      "KUNDA",
      "TÕRVA",
    ];

    // Check for location keywords with patterns
    const locationPatterns = [
      /ASUKOHT[:\s]*([A-ZÄÖÜÕ\s,]+)/,
      /KOHT[:\s]*([A-ZÄÖÜÕ\s,]+)/,
      /LINN[:\s]*([A-ZÄÖÜÕ\s,]+)/,
      /LOCATION[:\s]*([A-Z\s,]+)/,
      /SAAB KÄTTE[:\s]*([A-ZÄÖÜÕ\s,]+)/,
      /ASUB[:\s]*([A-ZÄÖÜÕ\s,]+)/,
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
      const selectors = [
        ".postbody",
        'td.row1[valign="top"] span.postbody',
        'td[validgn="top] span.postbody',
        ".post-content",
        "table.forumline td span.postbody",
      ];

      let content = "";

      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
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
