// server/scrapers/gpu-forum-scraper.js - Fixed with proper page state management
const puppeteer = require("puppeteer");

class GPUForumScraper {
  constructor(updateCallback = console.log) {
    this.updateCallback = updateCallback;
    this.browser = null;
    this.page = null;
    this.processedThreads = new Set();
    this.gpuData = [];
    this.currentListingUrl = null; // Track current listing page URL
  }

  async scrape(username, password, options = {}) {
    const { maxPages = 20, headless = true } = options;

    try {
      this.updateCallback("🚀 Starting GPU Forum Scraper...");

      await this.launchBrowser(headless);
      await this.login(username, password);

      let currentPageNum = 1;
      let startOffset = 0;
      const threadsPerPage = 25;

      // Main pagination loop
      while (currentPageNum <= maxPages) {
        // Set current listing page URL
        this.currentListingUrl = `https://foorum.hinnavaatlus.ee/viewforum.php?f=3&topicdays=0&start=${startOffset}`;

        this.updateCallback(
          `📄 Loading page ${currentPageNum} (offset: ${startOffset})...`,
        );

        // Navigate to listing page
        await this.navigateToListingPage();

        // Wait for page to load
        await this.page.waitForTimeout(500);

        // Check if we have any threads on this page
        const threadCount = await this.page.evaluate(() => {
          const rows = document.querySelectorAll("table.forumline tbody tr");
          let count = 0;
          for (let i = 4; i < rows.length; i++) {
            const titleLink = rows[i].querySelector(
              "span.topictitle a.topictitle",
            );
            if (titleLink && !titleLink.textContent.includes("Teadeanne")) {
              count++;
            }
          }
          return count;
        });

        if (threadCount === 0) {
          this.updateCallback(
            `No threads found on page ${currentPageNum}. Stopping.`,
          );
          break;
        }

        this.updateCallback(
          `Found ${threadCount} threads on page ${currentPageNum}`,
        );

        // Get all Videokaardid threads on this page
        const videokaardidThreads = await this.getVideokaardidThreads();
        this.updateCallback(
          `🎯 Found ${videokaardidThreads.length} Videokaardid threads`,
        );

        // Process each Videokaardid thread
        for (let i = 0; i < videokaardidThreads.length; i++) {
          const thread = videokaardidThreads[i];

          if (this.processedThreads.has(thread.url)) {
            this.updateCallback(
              `⏭️ Skipping already processed: ${thread.title.substring(0, 30)}...`,
            );
            continue;
          }

          this.updateCallback(
            `🔍 [${i + 1}/${videokaardidThreads.length}] Processing: ${thread.title.substring(0, 40)}...`,
          );

          // Process the thread
          const success = await this.processThread(thread);

          if (success) {
            this.updateCallback(`✅ Successfully processed thread`);
          } else {
            this.updateCallback(`⚠️ Failed to extract GPU data from thread`);
          }

          this.processedThreads.add(thread.url);

          // ALWAYS return to listing page after each thread
          this.updateCallback(`↩️ Returning to listing page...`);
          await this.navigateToListingPage();

          // Small delay before next thread
          await this.page.waitForTimeout(500);
        }

        this.updateCallback(
          `✅ Completed page ${currentPageNum} with ${videokaardidThreads.length} GPU threads`,
        );

        // Move to next page
        currentPageNum++;
        startOffset += threadsPerPage;

        // Delay before loading next page
        await this.page.waitForTimeout(500);
      }

      this.updateCallback(
        `🏁 Scraping complete! Found ${this.gpuData.length} GPU listings across ${currentPageNum - 1} pages`,
      );

      return {
        success: true,
        data: this.gpuData,
        totalListings: this.gpuData.length,
        processedThreads: this.processedThreads.size,
        processedPages: currentPageNum - 1,
      };
    } catch (error) {
      this.updateCallback(`❌ Fatal scraper error: ${error.message}`);
      console.error(error);
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

  async navigateToListingPage() {
    try {
      await this.page.goto(this.currentListingUrl, {
        waitUntil: "networkidle2",
        timeout: 30000,
      });
      // Extra wait to ensure page is fully loaded
      await this.page.waitForTimeout(500);
    } catch (error) {
      this.updateCallback(
        `⚠️ Error navigating to listing page: ${error.message}`,
      );
      throw error;
    }
  }

  async processThread(thread) {
    try {
      // Navigate to the thread
      await this.page.goto(thread.url, {
        waitUntil: "networkidle2",
        timeout: 20000,
      });

      // Wait for content to load
      await this.page.waitForTimeout(500);

      // Extract thread content
      const threadData = await this.extractThreadData();
      const fullText = `${thread.title} ${threadData.content}`;

      // Extract GPUs and prices
      const gpuListings = this.extractAllGPUsWithPrices(fullText);

      if (gpuListings.length === 0) {
        // Try to extract from title
        const gpuFromTitle = this.extractGPUFromTitle(thread.title);
        const prices = this.extractAllPrices(fullText);

        if (gpuFromTitle && prices.length > 0) {
          gpuListings.push({
            model: gpuFromTitle,
            ...prices[0],
          });
        }
      }

      if (gpuListings.length === 0) {
        return false;
      }

      // Get location
      let location = thread.location;
      if (!location) {
        location = this.extractLocation(fullText);
      }

      // Save each GPU found
      for (const gpu of gpuListings) {
        this.gpuData.push({
          id: this.generateId(thread.url) + "_" + this.gpuData.length,
          model: gpu.model,
          brand: this.detectBrand(gpu.model),
          price: gpu.price,
          currency: gpu.currency,
          ah_price: gpu.ah_price || null,
          ok_price: gpu.ok_price || null,
          title: thread.title,
          url: thread.url,
          author: thread.author,
          location: location,
          scraped_at: new Date().toISOString(),
        });

        let priceStr = `${gpu.price}${gpu.currency}`;
        if (gpu.ah_price) priceStr += `, AH: ${gpu.ah_price}`;
        if (gpu.ok_price) priceStr += `, OK: ${gpu.ok_price}`;

        this.updateCallback(`    💰 ${gpu.model} - ${priceStr}`);
      }

      return true;
    } catch (error) {
      this.updateCallback(`    ❌ Error processing thread: ${error.message}`);
      return false;
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
    return await this.page.evaluate(() => {
      const threads = [];
      const rows = document.querySelectorAll("table.forumline tbody tr");

      for (let i = 3; i < rows.length; i++) {
        const row = rows[i];

        try {
          const titleLink = row.querySelector("span.topictitle a.topictitle");
          if (!titleLink) continue;

          // Skip announcement
          if (titleLink.textContent.includes("Teadeanne")) continue;

          const topicTitleElement = row.querySelector("span.topictitle");
          if (!topicTitleElement) continue;

          let isVideokaardid = false;
          let location = null;

          // Check for Videokaardid text
          const fullText = topicTitleElement.textContent || "";
          if (fullText.includes("Videokaardid")) {
            isVideokaardid = true;
          }

          // Look for specific span elements, avoiding the reply counter
          const allSpans = topicTitleElement.querySelectorAll("span");

          allSpans.forEach((span, index) => {
            const text = span.textContent.trim();

            // Skip if it has the hv_fcounter class (reply counter)
            if (span.classList.contains("hv_fcounter")) {
              return;
            }

            if (text.includes("Videokaardid")) {
              isVideokaardid = true;
            } else if (text && text.length > 2 && text.length < 30) {
              // Check if this is NOT a number (reply count)
              const isNumber = /^\d+$/.test(text);

              // Check if it's not a class name or technical text
              const isTechnical =
                text.includes("class") ||
                text === "i" ||
                text.includes("span") ||
                text.includes("{");

              if (!isNumber && !isTechnical && !text.includes("Videokaardid")) {
                // This is likely a location
                const cleanText = text.replace(/^Asukoht:?\s*/i, "").trim();
                if (cleanText.length > 2) {
                  // Prefer the 3rd child span if available (typical location position)
                  if (
                    span.parentElement.querySelector("span:nth-child(3)") ===
                    span
                  ) {
                    location = cleanText;
                  } else if (!location) {
                    // Use this as fallback if no location found yet
                    location = cleanText;
                  }
                }
              }
            }
          });

          // Also check italic elements
          const italicElements = topicTitleElement.querySelectorAll("i");
          italicElements.forEach((elem) => {
            const text = elem.textContent.trim();
            if (text.includes("Videokaardid")) {
              isVideokaardid = true;
            } else if (
              !location &&
              text &&
              text.length > 2 &&
              text.length < 30
            ) {
              // Fallback location from italic text
              const cleanText = text.replace(/^Asukoht:?\s*/i, "").trim();
              const isNumber = /^\d+$/.test(cleanText);
              if (!isNumber && cleanText.length > 2) {
                location = cleanText;
              }
            }
          });

          if (isVideokaardid) {
            threads.push({
              title: titleLink.textContent.trim(),
              url: titleLink.href,
              author:
                row.cells[3]?.querySelector("a")?.textContent?.trim() ||
                "Unknown",
              location: location,
              category: "Videokaardid",
            });
          }
        } catch (e) {
          console.warn("Error processing row:", e.message);
        }
      }

      return threads;
    });
  }

  // Rest of the methods remain the same...
  extractGPUFromTitle(title) {
    const patterns = [
      /RTX\s*\d{4}\s*(TI|SUPER)?/gi,
      /GTX\s*\d{4}\s*(TI|SUPER)?/gi,
      /RX\s*\d{4}\s*(XT|XTX)?/gi,
      /ARC\s*A\d{3,4}/gi,
    ];

    for (const pattern of patterns) {
      const match = title.match(pattern);
      if (match) {
        return match[0].trim().replace(/\s+/g, " ").toUpperCase();
      }
    }
    return null;
  }

  extractAllGPUsWithPrices(text) {
    const gpuListings = [];
    const gpuModels = this.extractGPUModels(text);
    const allPrices = this.extractAllPrices(text);

    if (gpuModels.length === 0 || allPrices.length === 0) {
      return [];
    }

    if (gpuModels.length === 1) {
      gpuListings.push({
        model: gpuModels[0],
        ...allPrices[0],
      });
    } else {
      for (let i = 0; i < gpuModels.length; i++) {
        if (i < allPrices.length) {
          gpuListings.push({
            model: gpuModels[i],
            ...allPrices[i],
          });
        } else if (allPrices.length > 0) {
          gpuListings.push({
            model: gpuModels[i],
            ...allPrices[allPrices.length - 1],
          });
        }
      }
    }

    return gpuListings;
  }

  extractGPUModels(text) {
    const patterns = [
      /RTX\s*40[5-9]0\s*(TI|SUPER)?/gi,
      /RTX\s*406[05]\s*(TI)?/gi,
      /RTX\s*407[05]\s*(TI|SUPER)?/gi,
      /RTX\s*408[05]\s*(SUPER)?/gi,
      /RTX\s*4090/gi,
      /RTX\s*30[5-9]0\s*(TI)?/gi,
      /RTX\s*306[05]\s*(TI)?/gi,
      /RTX\s*307[05]\s*(TI)?/gi,
      /RTX\s*308[05]\s*(TI)?/gi,
      /RTX\s*3090\s*(TI)?/gi,
      /RTX\s*20[6-8]0\s*(SUPER)?/gi,
      /GTX\s*16[5-6]0\s*(TI|SUPER)?/gi,
      /GTX\s*10[5-8]0\s*(TI)?/gi,
      /RX\s*7[0-9]00\s*(XT|XTX)?/gi,
      /RX\s*6[0-9]00\s*(XT|XTX)?/gi,
      /RX\s*5[0-9]00\s*(XT)?/gi,
    ];

    const foundGPUs = new Set();
    for (const pattern of patterns) {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach((match) => {
          foundGPUs.add(match.trim().replace(/\s+/g, " ").toUpperCase());
        });
      }
    }
    return Array.from(foundGPUs);
  }

  extractAllPrices(text) {
    const prices = [];

    let ahPrice = null;
    let okPrice = null;
    let euroPrice = null;

    const ahMatch = text.match(/AH[:\s]*(\d+)/i);
    if (ahMatch) ahPrice = parseInt(ahMatch[1]);

    const okMatch = text.match(/OK[:\s]*(\d+)/i);
    if (okMatch) okPrice = parseInt(okMatch[1]);

    const euroPatterns = [
      /€\s*(\d+(?:[,\.]\d{1,2})?)/g,
      /(\d+(?:[,\.]\d{1,2})?)\s*€/g,
      /HIND[:\s]*(\d+)/gi,
      /MÜÜK[:\s]*(\d+)/gi,
    ];

    for (const pattern of euroPatterns) {
      const matches = [...text.matchAll(pattern)];
      for (const match of matches) {
        const price = parseFloat(match[1].replace(",", "."));
        if (!isNaN(price) && price >= 50 && price <= 5000) {
          euroPrice = Math.round(price);
          break;
        }
      }
      if (euroPrice) break;
    }

    if (euroPrice || ahPrice || okPrice) {
      const priceObj = {
        price: euroPrice || ahPrice || okPrice || 0,
        currency: euroPrice ? "€" : ahPrice ? "AH" : "OK",
      };
      if (ahPrice) priceObj.ah_price = ahPrice;
      if (okPrice) priceObj.ok_price = okPrice;
      prices.push(priceObj);
    }

    return prices;
  }

  extractLocation(text) {
    if (!text) return null;
    const upperText = text.toUpperCase();
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
    ];

    for (const city of cities) {
      if (upperText.includes(city)) {
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
        'td[valign="top"] span.postbody',
        "table.forumline td span.postbody",
      ];

      let content = "";
      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          content = elements[0].textContent || "";
          if (content.length > 50) break;
        }
      }
      return { content: content.trim() };
    });
  }

  detectBrand(model) {
    if (!model) return "Unknown";
    const modelUpper = model.toUpperCase();

    if (modelUpper.includes("RTX") || modelUpper.includes("GTX"))
      return "NVIDIA";
    if (modelUpper.includes("RX") || modelUpper.includes("RADEON"))
      return "AMD";
    if (modelUpper.includes("ARC")) return "Intel";
    return "Unknown";
  }

  generateId(url) {
    const threadId = url.split("t=")[1]?.split("&")[0] || Date.now();
    return `gpu_${threadId}`;
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
      this.updateCallback("🔒 Browser closed");
    }
  }
}

module.exports = GPUForumScraper;
