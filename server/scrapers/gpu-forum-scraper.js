// server/scrapers/gpu-forum-scraper-enhanced.js
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

      // Extract thread data including post date
      const threadData = await this.extractThreadDataWithDate();
      const fullText = `${thread.title} ${threadData.content}`;
      const postDate = threadData.postDate || thread.postDate;

      // Extract all GPUs with enhanced detection
      const gpuListings = this.extractAllGPUsWithEnhancedPrices(fullText);

      if (gpuListings.length === 0) {
        const gpuFromTitle = this.extractGPUFromTitleEnhanced(thread.title);
        const prices = this.extractAllPricesEnhanced(fullText);

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

      let location = thread.location;
      if (!location) {
        location = this.extractLocation(fullText);
      }

      // Save each GPU found
      for (let gpuIndex = 0; gpuIndex < gpuListings.length; gpuIndex++) {
        const gpu = gpuListings[gpuIndex];

        // Create unique ID for each GPU in thread
        const uniqueId = `${this.generateId(thread.url)}_gpu${gpuIndex}_${Date.now()}`;

        // Build full model name with brand and variant
        let fullModel = gpu.model;
        if (gpu.brand && !fullModel.includes(gpu.brand)) {
          fullModel = `${gpu.brand} ${fullModel}`;
        }
        if (gpu.variant) {
          fullModel = `${fullModel} ${gpu.variant}`;
        }

        this.gpuData.push({
          id: uniqueId,
          model: gpu.model,
          full_model: fullModel,
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
          post_date: postDate,
          scraped_at: new Date().toISOString(),
        });

        let priceStr = `${gpu.price}${gpu.currency}`;
        if (gpu.ah_price) priceStr += `, AH: ${gpu.ah_price}`;
        if (gpu.ok_price) priceStr += `, OK/H: ${gpu.ok_price}`;

        this.updateCallback(
          `    💰 ${gpu.model} ${gpu.variant ? `(${gpu.variant})` : ""} - ${priceStr}`,
        );
      }

      return true;
    } catch (error) {
      this.updateCallback(`    ❌ Error processing thread: ${error.message}`);
      return false;
    }
  }

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

      // Extract post date from the forum table
      let postDate = null;
      try {
        // Try multiple selectors for the date
        const dateSelectors = [
          "body > table > tbody > tr > td > table.forumline > tbody > tr:nth-child(4) > td:nth-child(4) > span",
          "table.forumline tbody tr:nth-child(4) td:nth-child(4) span",
          'td.row1[valign="top"] span.postdetails',
          "span.postdetails",
        ];

        for (const selector of dateSelectors) {
          const dateElement = document.querySelector(selector);
          if (dateElement && dateElement.textContent) {
            const dateText = dateElement.textContent.trim();
            // Estonian date format handling
            if (
              dateText.includes(".") ||
              dateText.includes("-") ||
              dateText.includes("/")
            ) {
              postDate = dateText;
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

  extractAllGPUsWithEnhancedPrices(text) {
    const gpuListings = [];
    const lines = text.split(/[\n\r]+/);

    // First, extract all GPUs with their full details
    const gpuDetailsPattern =
      /(\d+x\s+)?(GIGABYTE|MSI|ASUS|PNY|PALIT|ZOTAC|EVGA|Sapphire|PowerColor|Gainward|Inno3D|KFA2|Galax)?\s*(GeForce|Radeon|Arc)?\s*(RTX|GTX|GT|RX|ARC)?\s*(\d{3,4}\s*(Ti|TI|SUPER|XT|XTX)?)\s*([^€\n]*?)(?=\s*H:|AH:|OK:|€|\d+\s*eur|$)/gi;

    const matches = [...text.matchAll(gpuDetailsPattern)];

    for (const match of matches) {
      const quantity = match[1] ? parseInt(match[1]) : 1;
      const brand = match[2] || null;
      const series = match[3] || "";
      const prefix = match[4] || "";
      const modelNum = match[5] || "";
      const variant = match[7] ? match[7].trim() : null;

      // Build the core model (e.g., "RTX 3060 TI")
      let coreModel = `${prefix} ${modelNum}`
        .trim()
        .toUpperCase()
        .replace(/\s+/g, " ");

      // Look for price after this GPU mention
      const gpuPosition = match.index + match[0].length;
      const textAfterGPU = text.substring(
        gpuPosition,
        Math.min(gpuPosition + 200, text.length),
      );

      // Extract price from the text following the GPU
      const priceInfo = this.extractPriceFromText(textAfterGPU);

      if (priceInfo) {
        for (let i = 0; i < quantity; i++) {
          gpuListings.push({
            model: coreModel,
            brand: brand
              ? brand.toUpperCase()
              : this.detectBrandEnhanced(coreModel),
            variant: variant,
            ...priceInfo,
          });
        }
      }
    }

    // If no detailed matches, try simpler GPU pattern matching
    if (gpuListings.length === 0) {
      const simpleGPUs = this.extractSimpleGPUs(text);

      for (const gpu of simpleGPUs) {
        gpuListings.push(gpu);
      }
    }

    return gpuListings;
  }

  extractSimpleGPUs(text) {
    const gpuListings = [];

    // Simple GPU patterns
    const gpuPatterns = [
      /RTX\s*\d{4}\s*(Ti|TI|SUPER)?/gi,
      /GTX\s*\d{4}\s*(Ti|TI|SUPER)?/gi,
      /GT\s*10[23]0/gi,
      /RX\s*\d{4}\s*(XT|XTX)?/gi,
      /ARC\s*A\d{3,4}/gi,
    ];

    const foundGPUs = new Map();

    // Find all GPU models
    for (const pattern of gpuPatterns) {
      const matches = [...text.matchAll(pattern)];
      for (const match of matches) {
        const model = match[0].trim().toUpperCase().replace(/\s+/g, " ");
        if (!foundGPUs.has(model)) {
          foundGPUs.set(model, match.index);
        }
      }
    }

    // Extract all prices
    const allPrices = this.extractAllPricesFromText(text);

    // Match GPUs with prices based on proximity
    const gpuArray = Array.from(foundGPUs.entries()).sort(
      (a, b) => a[1] - b[1],
    );

    for (let i = 0; i < gpuArray.length; i++) {
      const [model, position] = gpuArray[i];

      // Find the closest price after this GPU
      let closestPrice = null;
      let minDistance = Infinity;

      for (const priceInfo of allPrices) {
        if (priceInfo.position > position) {
          const distance = priceInfo.position - position;
          if (distance < minDistance && distance < 100) {
            // Price should be within 100 chars
            minDistance = distance;
            closestPrice = priceInfo;
          }
        }
      }

      if (closestPrice) {
        gpuListings.push({
          model: model,
          brand: this.detectBrandEnhanced(model),
          variant: null,
          price: closestPrice.price,
          currency: closestPrice.currency,
          ah_price: closestPrice.ah_price || null,
          ok_price: closestPrice.ok_price || null,
        });
      }
    }

    // If still no matches, try to pair any GPUs with any prices
    if (
      gpuListings.length === 0 &&
      gpuArray.length > 0 &&
      allPrices.length > 0
    ) {
      const gpuCount = Math.min(gpuArray.length, allPrices.length);
      for (let i = 0; i < gpuCount; i++) {
        gpuListings.push({
          model: gpuArray[i][0],
          brand: this.detectBrandEnhanced(gpuArray[i][0]),
          variant: null,
          price: allPrices[i].price,
          currency: allPrices[i].currency,
          ah_price: allPrices[i].ah_price || null,
          ok_price: allPrices[i].ok_price || null,
        });
      }
    }

    return gpuListings;
  }

  extractPriceFromText(text) {
    // Look for H: format first (treat as OK)
    const hMatch = text.match(/^\s*H[:\s]*(\d+)\s*(eur|€)?/i);
    if (hMatch) {
      return {
        price: parseInt(hMatch[1]),
        currency: "€",
        ok_price: parseInt(hMatch[1]),
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
        };
      }
    }

    return null;
  }

  extractAllPricesFromText(text) {
    const prices = [];

    // Find all price patterns with their positions
    const pricePatterns = [
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
        const price = parseInt(match[1]);
        if (price >= 50 && price <= 5000) {
          const priceInfo = {
            price: price,
            currency: "€",
            position: match.index,
          };

          if (type === "ah") {
            priceInfo.ah_price = price;
          } else if (type === "ok") {
            priceInfo.ok_price = price;
          }

          prices.push(priceInfo);
        }
      }
    }

    // Remove duplicates based on position
    const uniquePrices = [];
    const seenPositions = new Set();

    for (const price of prices) {
      const key = `${price.position}-${price.price}`;
      if (!seenPositions.has(key)) {
        seenPositions.add(key);
        uniquePrices.push(price);
      }
    }

    return uniquePrices.sort((a, b) => a.position - b.position);
  }

  extractPriceFromLine(line) {
    // Handle H: format (should be treated as OK price)
    const hPriceMatch = line.match(/H[:\s]*(\d+)\s*(eur|€)?/i);
    if (hPriceMatch) {
      return {
        price: parseInt(hPriceMatch[1]),
        currency: "€",
        ok_price: parseInt(hPriceMatch[1]),
      };
    }

    // Handle AH format
    const ahMatch = line.match(/AH[:\s]*(\d+)/i);
    if (ahMatch) {
      return {
        price: parseInt(ahMatch[1]),
        currency: "€",
        ah_price: parseInt(ahMatch[1]),
      };
    }

    // Handle OK format
    const okMatch = line.match(/OK[:\s]*(\d+)/i);
    if (okMatch) {
      return {
        price: parseInt(okMatch[1]),
        currency: "€",
        ok_price: parseInt(okMatch[1]),
      };
    }

    // Handle regular euro prices
    const euroPatterns = [
      /€\s*(\d+(?:[,\.]\d{1,2})?)/,
      /(\d+(?:[,\.]\d{1,2})?)\s*€/,
      /(\d+(?:[,\.]\d{1,2})?)\s*eur/i,
      /HIND[:\s]*(\d+)/i,
      /MÜÜK[:\s]*(\d+)/i,
    ];

    for (const pattern of euroPatterns) {
      const match = line.match(pattern);
      if (match) {
        const price = parseFloat(match[1].replace(",", "."));
        if (!isNaN(price) && price >= 50 && price <= 5000) {
          return {
            price: Math.round(price),
            currency: "€",
          };
        }
      }
    }

    return null;
  }

  extractGPUModelsEnhanced(text) {
    const patterns = [
      // RTX 50 series (latest generation)
      /RTX\s*50[5-9]0\s*(TI|SUPER)?/gi,
      /RTX\s*507[05]\s*(TI|SUPER)?/gi,
      /RTX\s*508[05]\s*(SUPER)?/gi,
      /RTX\s*5090/gi,
      // RTX 40 series
      /RTX\s*40[5-9]0\s*(TI|SUPER)?/gi,
      /RTX\s*406[05]\s*(TI)?/gi,
      /RTX\s*407[05]\s*(TI|SUPER)?/gi,
      /RTX\s*408[05]\s*(SUPER)?/gi,
      /RTX\s*4090/gi,
      // RTX 30 series
      /RTX\s*30[5-9]0\s*(TI)?/gi,
      /RTX\s*306[05]\s*(TI)?/gi,
      /RTX\s*307[05]\s*(TI)?/gi,
      /RTX\s*308[05]\s*(TI)?/gi,
      /RTX\s*3090\s*(TI)?/gi,
      // RTX 20 series
      /RTX\s*20[6-8]0\s*(SUPER)?/gi,
      // GTX series
      /GTX\s*16[5-6]0\s*(TI|SUPER)?/gi,
      /GTX\s*10[5-8]0\s*(TI)?/gi,
      /GT\s*10[23]0/gi,
      // AMD RX 9000 series (latest)
      /RX\s*9[0-9]00\s*(XT|XTX)?/gi,
      // AMD RX series
      /RX\s*7[0-9]00\s*(XT|XTX)?/gi,
      /RX\s*6[0-9]00\s*(XT|XTX)?/gi,
      /RX\s*5[0-9]00\s*(XT)?/gi,
      /RX\s*580/gi,
      /RX\s*570/gi,
      /RX\s*480/gi,
      /RX\s*470/gi,
      // Intel ARC
      /ARC\s*A[0-9]{3,4}/gi,
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

  extractGPUFromTitleEnhanced(title) {
    const patterns = [
      /RTX\s*\d{4}\s*(TI|SUPER)?/gi,
      /GTX\s*\d{4}\s*(TI|SUPER)?/gi,
      /GT\s*10[23]0/gi,
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

  extractAllPricesEnhanced(text) {
    const prices = [];

    // Extract H: prices (treat as OK)
    const hMatches = [...text.matchAll(/H[:\s]*(\d+)\s*(eur|€)?/gi)];
    for (const match of hMatches) {
      const price = parseInt(match[1]);
      if (price >= 50 && price <= 5000) {
        prices.push({
          price: price,
          currency: "€",
          ok_price: price,
        });
      }
    }

    // Extract AH prices
    const ahMatches = [...text.matchAll(/AH[:\s]*(\d+)/gi)];
    for (const match of ahMatches) {
      const price = parseInt(match[1]);
      if (price >= 50 && price <= 5000) {
        const existingPrice = prices.find((p) => !p.ah_price);
        if (existingPrice) {
          existingPrice.ah_price = price;
        } else {
          prices.push({
            price: price,
            currency: "€",
            ah_price: price,
          });
        }
      }
    }

    // Extract OK prices
    const okMatches = [...text.matchAll(/OK[:\s]*(\d+)/gi)];
    for (const match of okMatches) {
      const price = parseInt(match[1]);
      if (price >= 50 && price <= 5000) {
        const existingPrice = prices.find((p) => !p.ok_price);
        if (existingPrice) {
          existingPrice.ok_price = price;
        } else {
          prices.push({
            price: price,
            currency: "€",
            ok_price: price,
          });
        }
      }
    }

    // Extract regular euro prices
    const euroPatterns = [
      /€\s*(\d+(?:[,\.]\d{1,2})?)/g,
      /(\d+(?:[,\.]\d{1,2})?)\s*€/g,
      /(\d+(?:[,\.]\d{1,2})?)\s*eur/gi,
      /HIND[:\s]*(\d+)/gi,
      /MÜÜK[:\s]*(\d+)/gi,
    ];

    for (const pattern of euroPatterns) {
      const matches = [...text.matchAll(pattern)];
      for (const match of matches) {
        const price = parseFloat(match[1].replace(",", "."));
        if (!isNaN(price) && price >= 50 && price <= 5000) {
          // Check if we already have this price
          if (!prices.some((p) => p.price === Math.round(price))) {
            prices.push({
              price: Math.round(price),
              currency: "€",
            });
          }
        }
      }
    }

    return prices;
  }

  detectBrandEnhanced(model) {
    if (!model) return "Unknown";
    const modelUpper = model.toUpperCase();

    // NVIDIA cards
    if (
      modelUpper.includes("RTX") ||
      modelUpper.includes("GTX") ||
      modelUpper.includes("GT")
    ) {
      return "NVIDIA";
    }
    // AMD cards
    if (modelUpper.includes("RX") || modelUpper.includes("RADEON")) {
      return "AMD";
    }
    // Intel cards
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

          // Extract post date from the row
          let postDate = null;
          const dateCell = row.cells[4]; // Usually the 5th cell contains date
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
              let cleanText = text
                .replace(/Asukoht[:：]\s*/gi, "")
                .replace(/^[：:]\s*/, "")
                .replace(/^Asukoht\s*/i, "")
                .trim();

              if (cleanText.toLowerCase().includes("asukoht")) {
                const parts = cleanText.split(/asukoht[:：]?\s*/i);
                cleanText = parts[parts.length - 1].trim();
              }

              const isNumber = /^\d+$/.test(cleanText);
              if (
                !isNumber &&
                cleanText.length > 2 &&
                !cleanText.includes(":")
              ) {
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
