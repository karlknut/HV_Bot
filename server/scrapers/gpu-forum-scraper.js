// server/scrapers/gpu-forum-scraper.js - Enhanced with full model names and post date
const puppeteer = require("puppeteer");

class GPUForumScraperEnhanced {
  constructor(updateCallback = console.log) {
    this.updateCallback = updateCallback;
    this.browser = null;
    this.page = null;
    this.processedThreads = new Set();
    this.gpuData = [];
    this.currentListingUrl = null;
  }

  async scrape(username, password, options = {}) {
    const { maxPages = 20, headless = true } = options;

    try {
      this.updateCallback("🚀 Starting Enhanced GPU Forum Scraper...");

      await this.launchBrowser(headless);
      await this.login(username, password);

      let currentPageNum = 1;
      let startOffset = 0;
      const threadsPerPage = 25;

      while (currentPageNum <= maxPages) {
        this.currentListingUrl = `https://foorum.hinnavaatlus.ee/viewforum.php?f=3&topicdays=0&start=${startOffset}`;

        this.updateCallback(
          `📄 Loading page ${currentPageNum} (offset: ${startOffset})...`,
        );

        await this.navigateToListingPage();
        await this.page.waitForTimeout(500);

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

        const videokaardidThreads = await this.getVideokaardidThreads();
        this.updateCallback(
          `🎯 Found ${videokaardidThreads.length} Videokaardid threads`,
        );

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

          const success = await this.processThread(thread);

          if (success) {
            this.updateCallback(`✅ Successfully processed thread`);
          } else {
            this.updateCallback(`⚠️ Failed to extract GPU data from thread`);
          }

          this.processedThreads.add(thread.url);

          this.updateCallback(`↩️ Returning to listing page...`);
          await this.navigateToListingPage();
          await this.page.waitForTimeout(500);
        }

        this.updateCallback(
          `✅ Completed page ${currentPageNum} with ${videokaardidThreads.length} GPU threads`,
        );

        currentPageNum++;
        startOffset += threadsPerPage;
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

  async processThread(thread) {
    try {
      await this.page.goto(thread.url, {
        waitUntil: "networkidle2",
        timeout: 20000,
      });

      await this.page.waitForTimeout(500);

      // FIXED: Extract post date from thread page
      const threadData = await this.extractThreadDataWithDate();
      const postDate = threadData.postDate || thread.postDate;

      const fullText = `${thread.title} ${threadData.content}`;

      // FIXED: Extract GPUs with full model names including brand/variant
      const gpuListings = this.extractAllGPUsWithFullDetails(
        fullText,
        thread.title,
      );

      if (gpuListings.length === 0) {
        return false;
      }

      let location = thread.location;
      if (!location) {
        location = this.extractLocation(fullText);
      }

      // Save each GPU found
      for (let gpuIndex = 0; gpuIndex < gpuListings.length; gpuIndex++) {
        const gpu = gpuListings[gpuIndex];

        const uniqueId = `${this.generateId(thread.url)}_gpu${gpuIndex}_${Date.now()}`;

        // FIXED: Build full model name with brand and variant
        let fullModel = gpu.model;
        if (
          gpu.brand &&
          !fullModel.toLowerCase().includes(gpu.brand.toLowerCase())
        ) {
          fullModel = `${gpu.brand} ${fullModel}`;
        }
        if (gpu.variant) {
          fullModel = `${fullModel} ${gpu.variant}`;
        }

        // Create normalized model (for duplicate detection)
        const normalizedModel = gpu.model.toUpperCase().replace(/\s+/g, "_");

        this.gpuData.push({
          id: uniqueId,
          model: gpu.model,
          full_model: fullModel,
          normalized_model: normalizedModel,
          brand: gpu.brand || this.detectBrandEnhanced(gpu.model),
          variant: gpu.variant || null,
          price: gpu.price,
          currency: gpu.currency,
          ah_price: gpu.ah_price || null,
          ok_price: gpu.ok_price || null,
          title: thread.title,
          url: thread.url,
          author: thread.author,
          location: location,
          forum_post_date: postDate, // FIXED: Use correct column name
          scraped_at: new Date().toISOString(),
        });

        let priceStr = `${gpu.price}${gpu.currency}`;
        if (gpu.ah_price) priceStr += `, AH: ${gpu.ah_price}`;
        if (gpu.ok_price) priceStr += `, OK: ${gpu.ok_price}`;

        this.updateCallback(`    💰 ${fullModel} - ${priceStr}`);
      }

      return true;
    } catch (error) {
      this.updateCallback(`    ❌ Error processing thread: ${error.message}`);
      return false;
    }
  }

  // FIXED: Extract post date from thread page
  async extractThreadDataWithDate() {
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

      // FIXED: Extract post date using multiple selectors
      let postDate = null;
      try {
        const dateSelectors = [
          // From thread page
          "body > table > tbody > tr > td > table.forumline > tbody > tr:nth-child(4) > td:nth-child(2) > table > tbody > tr:nth-child(1) > td:nth-child(1) > span > span",
          // Alternative selectors
          "table.forumline tbody tr:nth-child(4) td:nth-child(2) table tbody tr:nth-child(1) td:nth-child(1) span span",
          'td.row1[valign="top"] span.postdetails',
          "span.postdetails",
        ];

        for (const selector of dateSelectors) {
          const dateElement = document.querySelector(selector);
          if (dateElement && dateElement.textContent) {
            const dateText = dateElement.textContent.trim();
            if (
              dateText.includes(".") ||
              dateText.includes("-") ||
              dateText.includes("/") ||
              dateText.match(/\d{1,2}\s+\w+\s+\d{4}/)
            ) {
              postDate = dateText;
              console.log("Found post date:", postDate);
              break;
            }
          }
        }
      } catch (e) {
        console.warn("Could not extract post date:", e.message);
      }

      return { content: content.trim(), postDate };
    });
  }

  // FIXED: Enhanced GPU extraction with full model names
  extractAllGPUsWithFullDetails(text, title) {
    const gpuListings = [];
    const lines = text.split(/[\n\r]+/);

    // FIXED: Enhanced pattern to capture full brand + variant + model
    const fullGPUPattern =
      /(?:(\d+)x\s+)?(ASUS\s+ROG\s+\w+|GIGABYTE|MSI\s+\w+|PNY|PALIT\s+\w+|ZOTAC\s+\w+|EVGA|Sapphire\s+\w+|PowerColor|Gainward\s+\w+|Inno3D|KFA2|Galax|ASUS|MSI|Palit|Zotac|Gainward)?\s*(GeForce|Radeon|Arc)?\s*(RTX|GTX|GT|RX|ARC)?\s*(\d{3,4})\s*(Ti|TI|SUPER|XT|XTX)?\s*(\d+GB|\d+\s*GB)?/gi;

    const matches = [...text.matchAll(fullGPUPattern)];

    for (const match of matches) {
      const quantity = match[1] ? parseInt(match[1]) : 1;
      let brand = match[2] || null;
      const series = match[3] || "";
      const prefix = match[4] || "";
      const modelNum = match[5] || "";
      const suffix = match[6] || "";
      const memory = match[7] || null;

      // Clean up brand name
      if (brand) {
        brand = brand.trim().split(/\s+/)[0]; // Take first word for brand
      }

      // Build core model
      let coreModel = `${prefix} ${modelNum} ${suffix}`
        .trim()
        .toUpperCase()
        .replace(/\s+/g, " ");

      // Build variant (everything after base model)
      let variant = null;
      if (memory) {
        variant = memory.trim();
      }

      // Look for price after this GPU mention
      const gpuPosition = match.index + match[0].length;
      const textAfterGPU = text.substring(
        gpuPosition,
        Math.min(gpuPosition + 200, text.length),
      );

      const priceInfo = this.extractPriceFromText(textAfterGPU);

      if (priceInfo) {
        for (let i = 0; i < quantity; i++) {
          gpuListings.push({
            model: coreModel,
            brand: brand || this.detectBrandEnhanced(coreModel),
            variant: variant,
            ...priceInfo,
          });
        }
      }
    }

    // FIXED: If no matches, try to extract from title
    if (gpuListings.length === 0) {
      const titleGPU = this.extractGPUFromTitle(title);
      const prices = this.extractAllPricesFromText(text);

      if (titleGPU && prices.length > 0) {
        for (const priceInfo of prices) {
          gpuListings.push({
            model: titleGPU.model,
            brand: titleGPU.brand,
            variant: titleGPU.variant,
            ...priceInfo,
          });
        }
      }
    }

    return gpuListings;
  }

  // FIXED: Extract GPU from title with brand and variant
  extractGPUFromTitle(title) {
    const fullMatch = title.match(
      /(ASUS\s+ROG\s+\w+|GIGABYTE|MSI\s+\w+|ASUS|MSI|Palit|Gainward\s+\w+|Zotac)?\s*(GeForce)?\s*(RTX|GTX|RX|ARC)\s*(\d{3,4})\s*(Ti|TI|SUPER|XT|XTX)?\s*(\d+GB)?/i,
    );

    if (fullMatch) {
      const brand = fullMatch[1] ? fullMatch[1].trim().split(/\s+/)[0] : null;
      const prefix = fullMatch[3] || "";
      const modelNum = fullMatch[4] || "";
      const suffix = fullMatch[5] || "";
      const memory = fullMatch[6] || null;

      const model = `${prefix} ${modelNum} ${suffix}`
        .trim()
        .toUpperCase()
        .replace(/\s+/g, " ");

      return {
        model: model,
        brand: brand || this.detectBrandEnhanced(model),
        variant: memory,
      };
    }

    return null;
  }

  extractPriceFromText(text) {
    // Look for H: format (treat as OK)
    const hMatch = text.match(/^\s*H[:\s]*(\d+)\s*(eur|€)?/i);
    if (hMatch) {
      return {
        price: parseInt(hMatch[1]),
        currency: "€",
        ok_price: parseInt(hMatch[1]),
      };
    }

    // Look for AH and OK together
    const bothMatch = text.match(/AH[:\s]*(\d+).*?OK[:\s]*(\d+)/i);
    if (bothMatch) {
      return {
        price: parseInt(bothMatch[1]), // Use AH as main price
        currency: "€",
        ah_price: parseInt(bothMatch[1]),
        ok_price: parseInt(bothMatch[2]),
      };
    }

    // Look for AH format
    const ahMatch = text.match(/^\s*AH[:\s]*(\d+)/i);
    if (ahMatch) {
      return {
        price: parseInt(ahMatch[1]),
        currency: "€",
        ah_price: parseInt(ahMatch[1]),
      };
    }

    // Look for OK format
    const okMatch = text.match(/^\s*OK[:\s]*(\d+)/i);
    if (okMatch) {
      return {
        price: parseInt(okMatch[1]),
        currency: "€",
        ok_price: parseInt(okMatch[1]),
      };
    }

    // Look for euro price
    const euroMatch = text.match(/^\s*(\d+)\s*(eur|€)/i);
    if (euroMatch) {
      const price = parseInt(euroMatch[1]);
      if (price >= 50 && price <= 5000) {
        return {
          price: price,
          currency: "€",
          ok_price: price, // Default to OK
        };
      }
    }

    return null;
  }

  extractAllPricesFromText(text) {
    const prices = [];

    // Find all price patterns with their positions
    const pricePatterns = [
      { pattern: /AH[:\s]*(\d+).*?OK[:\s]*(\d+)/gi, type: "both" },
      { pattern: /H[:\s]*(\d+)\s*(eur|€)?/gi, type: "ok" },
      { pattern: /AH[:\s]*(\d+)/gi, type: "ah" },
      { pattern: /OK[:\s]*(\d+)/gi, type: "ok" },
      { pattern: /€\s*(\d+)/g, type: "euro" },
      { pattern: /(\d+)\s*€/g, type: "euro" },
      { pattern: /(\d+)\s*eur/gi, type: "euro" },
    ];

    for (const { pattern, type } of pricePatterns) {
      const matches = [...text.matchAll(pattern)];
      for (const match of matches) {
        let priceInfo = null;

        if (type === "both") {
          const ahPrice = parseInt(match[1]);
          const okPrice = parseInt(match[2]);
          if (
            ahPrice >= 50 &&
            ahPrice <= 5000 &&
            okPrice >= 50 &&
            okPrice <= 5000
          ) {
            priceInfo = {
              price: ahPrice,
              currency: "€",
              position: match.index,
              ah_price: ahPrice,
              ok_price: okPrice,
            };
          }
        } else {
          const price = parseInt(match[1]);
          if (price >= 50 && price <= 5000) {
            priceInfo = {
              price: price,
              currency: "€",
              position: match.index,
            };

            if (type === "ah") {
              priceInfo.ah_price = price;
            } else if (type === "ok") {
              priceInfo.ok_price = price;
            } else {
              priceInfo.ok_price = price; // Default to OK
            }
          }
        }

        if (priceInfo) {
          prices.push(priceInfo);
        }
      }
    }

    return prices.sort((a, b) => a.position - b.position);
  }

  detectBrandEnhanced(model) {
    if (!model) return "Unknown";
    const modelUpper = model.toUpperCase();

    if (
      modelUpper.includes("RTX") ||
      modelUpper.includes("GTX") ||
      modelUpper.includes("GT")
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

  async getVideokaardidThreads() {
    return await this.page.evaluate(() => {
      const threads = [];
      const rows = document.querySelectorAll("table.forumline tbody tr");

      for (let i = 3; i < rows.length; i++) {
        const row = rows[i];

        try {
          const titleLink = row.querySelector("span.topictitle a.topictitle");
          if (!titleLink) continue;

          if (titleLink.textContent.includes("Teadeanne")) continue;

          const topicTitleElement = row.querySelector("span.topictitle");
          if (!topicTitleElement) continue;

          // FIXED: Extract post date from listing page
          let postDate = null;
          const dateCell = row.querySelector("td:nth-child(5)"); // 5th column has date
          if (dateCell) {
            const dateSpan = dateCell.querySelector("span");
            if (dateSpan) {
              postDate = dateSpan.textContent.trim();
            }
          }

          let isVideokaardid = false;
          let location = null;

          const fullText = topicTitleElement.textContent || "";
          if (fullText.includes("Videokaardid")) {
            isVideokaardid = true;
          }

          const allSpans = topicTitleElement.querySelectorAll("span");

          allSpans.forEach((span) => {
            const text = span.textContent.trim();

            if (span.classList.contains("hv_fcounter")) {
              return;
            }

            if (text.includes("Videokaardid")) {
              isVideokaardid = true;
            } else if (text && text.length > 2 && text.length < 30) {
              const isNumber = /^\d+$/.test(text);
              const isTechnical =
                text.includes("class") ||
                text === "i" ||
                text.includes("span") ||
                text.includes("{");

              if (!isNumber && !isTechnical && !text.includes("Videokaardid")) {
                let cleanText = text
                  .replace(/Asukoht[:：]\s*/gi, "")
                  .replace(/^[：:]\s*/, "")
                  .replace(/^Asukoht\s*/i, "")
                  .trim();

                if (cleanText.toLowerCase().includes("asukoht")) {
                  const parts = cleanText.split(/asukoht[:：]?\s*/i);
                  cleanText = parts[parts.length - 1].trim();
                }

                if (
                  cleanText.length > 2 &&
                  cleanText.length < 30 &&
                  !cleanText.includes(":")
                ) {
                  if (
                    span.parentElement.querySelector("span:nth-child(3)") ===
                    span
                  ) {
                    location = cleanText;
                  } else if (!location) {
                    location = cleanText;
                  }
                }
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
              postDate: postDate,
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

  async navigateToListingPage() {
    try {
      await this.page.goto(this.currentListingUrl, {
        waitUntil: "networkidle2",
        timeout: 30000,
      });
      await this.page.waitForTimeout(500);
    } catch (error) {
      this.updateCallback(
        `⚠️ Error navigating to listing page: ${error.message}`,
      );
      throw error;
    }
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

module.exports = GPUForumScraperEnhanced;
