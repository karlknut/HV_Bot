// server/scrapers/gpu-forum-scraper.js - Fixed UUID issue
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

      // Extract post date from thread page
      const threadData = await this.extractThreadDataWithDate();

      // Parse the date properly
      let postDate = null;
      if (threadData.postDate) {
        postDate = this.parseEstonianDate(threadData.postDate);
      }
      if (!postDate && thread.postDate) {
        postDate = this.parseEstonianDate(thread.postDate);
      }

      // If still no date, use current date as fallback
      if (!postDate) {
        console.log(
          `Warning: No valid date found for thread, using current date`,
        );
        postDate = new Date().toISOString();
      }

      const fullText = `${thread.title} ${threadData.content}`;

      // Extract GPUs with improved detection
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

        // Build full model name with brand and variant
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
          forum_post_date: postDate, // Now properly formatted as ISO string
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

  // Extract post date from thread page
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

      // Extract post date using multiple selectors
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

  // Enhanced GPU extraction with full model names
  extractAllGPUsWithFullDetails(text, title) {
    const gpuListings = [];
    console.log(`Extracting GPUs from thread: ${title.substring(0, 50)}...`);

    // Clean and prepare text
    const cleanText = text.replace(/\s+/g, " ").trim();
    const lines = text.split(/[\n\r]+/);

    // Track found GPUs to avoid duplicates
    const foundGPUs = new Map();

    // Comprehensive GPU patterns
    const gpuPatterns = [
      // Pattern for "3x RTX 4070" or "2x RX 6700 XT"
      /(\d+)\s*[xX]\s*(RTX|GTX|RX|ARC)\s*(\d{3,4})\s*(Ti|TI|SUPER|XT|XTX)?/gi,

      // Standard GPU patterns with optional brand
      /(?:(ASUS|MSI|GIGABYTE|EVGA|ZOTAC|PNY|PALIT|SAPPHIRE|POWERCOLOR|XFX)\s+)?(?:ROG\s+STRIX\s+|TUF\s+|GAMING\s+)?(RTX|GTX|RX|ARC)\s*(\d{3,4})\s*(Ti|TI|SUPER|XT|XTX)?(?:\s+(\d+)GB)?/gi,

      // Just model numbers that look like GPUs
      /(RTX|GTX|RX)\s*(\d{3,4})\s*(Ti|TI|SUPER|XT|XTX)?/gi,
    ];

    // Extract all GPU models first
    const gpuModels = [];

    for (const pattern of gpuPatterns) {
      const matches = [...cleanText.matchAll(pattern)];

      for (const match of matches) {
        let quantity = 1;
        let model = "";
        let brand = null;
        let variant = null;

        // Check if this is a quantity pattern (e.g., "3x RTX 4070")
        if (match[1] && !isNaN(parseInt(match[1])) && parseInt(match[1]) < 10) {
          quantity = parseInt(match[1]);

          if (match[2] && match[3]) {
            model = `${match[2]} ${match[3]}${match[4] ? " " + match[4] : ""}`
              .trim()
              .toUpperCase();
          }
        } else {
          // Standard pattern
          if (match[1] && isNaN(parseInt(match[1]))) {
            brand = match[1].toUpperCase();
          }

          // Build model from components
          let modelPrefix = match[2] || match[1];
          let modelNumber = match[3] || match[2];
          let modelSuffix = match[4] || match[3] || "";

          if (modelPrefix && modelNumber) {
            model =
              `${modelPrefix} ${modelNumber}${modelSuffix ? " " + modelSuffix : ""}`
                .trim()
                .toUpperCase();
          }
        }

        // Clean up model
        model = model.replace(/\s+/g, " ").trim();

        // Skip invalid models
        if (!model || model.length < 5) continue;
        if (!model.match(/(RTX|GTX|RX|ARC)\s*\d{3,4}/i)) continue;

        // Detect brand if not found
        if (!brand) {
          brand = this.detectBrandEnhanced(model);
        }

        // Check for memory variant
        const memMatch = match[0].match(/(\d+)\s*GB/i);
        if (memMatch) {
          variant = `${memMatch[1]}GB`;
        }

        // Add to list with position
        for (let i = 0; i < quantity; i++) {
          gpuModels.push({
            model: model,
            brand: brand,
            variant: variant,
            position: match.index,
            originalText: match[0],
          });
        }
      }
    }

    // Look for prices in the text
    const prices = this.extractAllPricesWithContext(text);

    console.log(
      `Found ${gpuModels.length} GPU models and ${prices.length} prices`,
    );

    // Match GPUs with prices
    if (gpuModels.length > 0 && prices.length > 0) {
      // If we have equal or more prices than GPUs, match them in order
      if (prices.length >= gpuModels.length) {
        for (let i = 0; i < gpuModels.length; i++) {
          const gpu = gpuModels[i];
          const price = prices[i];

          gpuListings.push({
            model: gpu.model,
            brand: gpu.brand,
            variant: gpu.variant,
            price: price.price,
            currency: price.currency || "€",
            ah_price: price.ah_price || null,
            ok_price: price.ok_price || null,
          });
        }
      }
      // If we have more GPUs than prices but all GPUs are the same model
      else if (gpuModels.every((g) => g.model === gpuModels[0].model)) {
        // All GPUs are the same, use the first price for all
        const price = prices[0];
        for (const gpu of gpuModels) {
          gpuListings.push({
            model: gpu.model,
            brand: gpu.brand,
            variant: gpu.variant,
            price: price.price,
            currency: price.currency || "€",
            ah_price: price.ah_price || null,
            ok_price: price.ok_price || null,
          });
        }
      }
      // Otherwise try to match by proximity
      else {
        for (const gpu of gpuModels) {
          // Find the closest price after this GPU mention
          const closestPrice = this.findClosestPrice(
            gpu.position,
            prices,
            text.length,
          );

          if (closestPrice) {
            gpuListings.push({
              model: gpu.model,
              brand: gpu.brand,
              variant: gpu.variant,
              price: closestPrice.price,
              currency: closestPrice.currency || "€",
              ah_price: closestPrice.ah_price || null,
              ok_price: closestPrice.ok_price || null,
            });
          }
        }
      }
    }
    // If only one GPU model but multiple prices, might be selling multiple of the same
    else if (gpuModels.length === 1 && prices.length > 1) {
      const gpu = gpuModels[0];

      // Check if title indicates multiple items (e.g., "3x RTX 4070")
      const qtyMatch = title.match(/(\d+)\s*[xX]\s*(RTX|GTX|RX)/i);
      if (qtyMatch && prices.length === parseInt(qtyMatch[1])) {
        // Create listing for each price
        for (const price of prices) {
          gpuListings.push({
            model: gpu.model,
            brand: gpu.brand,
            variant: gpu.variant,
            price: price.price,
            currency: price.currency || "€",
            ah_price: price.ah_price || null,
            ok_price: price.ok_price || null,
          });
        }
      } else {
        // Just use the first price
        gpuListings.push({
          model: gpu.model,
          brand: gpu.brand,
          variant: gpu.variant,
          price: prices[0].price,
          currency: prices[0].currency || "€",
          ah_price: prices[0].ah_price || null,
          ok_price: prices[0].ok_price || null,
        });
      }
    }

    // Log what we found
    if (gpuListings.length > 0) {
      console.log(`✅ Extracted ${gpuListings.length} GPU listings:`);
      gpuListings.forEach((gpu, i) => {
        console.log(`   ${i + 1}. ${gpu.model} - €${gpu.price}`);
      });
    } else {
      console.log(`⚠️ No valid GPU listings extracted from thread`);
    }

    return gpuListings;
  }

  findClosestPrice(gpuPosition, prices, textLength) {
    if (prices.length === 0) return null;

    // Look for price within 150 characters after GPU
    const maxDistance = 150;
    let closestPrice = null;
    let minDistance = textLength;

    for (const price of prices) {
      // Price should come after GPU mention
      if (price.position > gpuPosition) {
        const distance = price.position - gpuPosition;

        if (distance < maxDistance && distance < minDistance) {
          minDistance = distance;
          closestPrice = price;
        }
      }
    }

    // If no price found after, try before (within 50 chars)
    if (!closestPrice) {
      for (const price of prices) {
        if (price.position < gpuPosition) {
          const distance = gpuPosition - price.position;

          if (distance < 50 && distance < minDistance) {
            minDistance = distance;
            closestPrice = price;
          }
        }
      }
    }

    return closestPrice;
  }

  // Extract GPU from title with brand and variant
  extractGPUFromTitle(title) {
    // More comprehensive title patterns
    const patterns = [
      // RTX 50 series
      /(RTX\s*50[789]0)(?:\s*Ti)?/i,
      // RTX 40 series
      /(RTX\s*40[6789]0)(?:\s*Ti)?/i,
      // RTX 30 series
      /(RTX\s*30[5678]0)(?:\s*Ti)?/i,
      // RTX 20 series
      /(RTX\s*20[678]0)(?:\s*Ti)?(?:\s*SUPER)?/i,
      // GTX series
      /(GTX\s*1[06][5678]0)(?:\s*Ti)?/i,
      // AMD RX
      /(RX\s*[67][89]00)(?:\s*XT)?(?:\s*XTX)?/i,
      // Intel Arc
      /(ARC\s*A[37][578]0)/i,
    ];

    for (const pattern of patterns) {
      const match = title.match(pattern);
      if (match) {
        const model = match[1].replace(/\s+/g, " ").trim().toUpperCase();

        // Check for brand in title
        let brand = null;
        const brandMatch = title.match(
          /(ASUS|MSI|GIGABYTE|EVGA|ZOTAC|PNY|PALIT|GAINWARD|SAPPHIRE|POWERCOLOR|XFX|INTEL)/i,
        );
        if (brandMatch) {
          brand = brandMatch[1].toUpperCase();
        }

        // Check for memory variant
        let variant = null;
        const memMatch = title.match(/(\d+)\s*GB/i);
        if (memMatch) {
          variant = `${memMatch[1]}GB`;
        }

        return {
          model: model,
          brand: brand || this.detectBrandEnhanced(model),
          variant: variant,
        };
      }
    }

    return null;
  }

  extractGPUFromTitleFallback(title) {
    // Check if title contains videokaart/GPU keywords and a number that could be a model
    const gpuKeywords = /videokaart|gpu|graafika|graafikakaart|video\s*kaart/i;

    if (gpuKeywords.test(title)) {
      // Look for anything that might be a GPU model number
      const numberPattern = /\b([346-9][0-9]{2}0)\b/;
      const numberMatch = title.match(numberPattern);

      if (numberMatch) {
        // Try to determine GPU type based on context or number range
        const modelNum = parseInt(numberMatch[1]);

        let prefix = "";
        if (modelNum >= 4060 && modelNum <= 4090) {
          prefix = "RTX";
        } else if (modelNum >= 3050 && modelNum <= 3090) {
          prefix = "RTX";
        } else if (modelNum >= 1650 && modelNum <= 1680) {
          prefix = "GTX";
        } else if (modelNum >= 6400 && modelNum <= 7900) {
          prefix = "RX";
        }

        if (prefix) {
          return {
            model: `${prefix} ${modelNum}`,
            brand: "Unknown",
            variant: null,
          };
        }
      }
    }

    return null;
  }

  extractPriceFromContext(text, startPosition) {
    // Look for price within ~100 characters after GPU mention
    const contextLength = 150;
    const priceContext = text.substring(
      startPosition,
      Math.min(startPosition + contextLength, text.length),
    );

    // Price patterns in order of preference
    const patterns = [
      { regex: /H[:\s]*(\d+)(?:\s*eur|€)?/i, type: "ok" },
      { regex: /AH[:\s]*(\d+).*?OK[:\s]*(\d+)/i, type: "both" },
      { regex: /AH[:\s]*(\d+)/i, type: "ah" },
      { regex: /OK[:\s]*(\d+)/i, type: "ok" },
      { regex: /€\s*(\d+)/i, type: "euro" },
      { regex: /(\d+)\s*€/i, type: "euro" },
      { regex: /(\d{3,4})\s*eur/i, type: "euro" },
      { regex: /hind[:\s]*(\d+)/i, type: "euro" }, // Estonian "price"
      { regex: /müün[:\s]*(\d+)/i, type: "euro" }, // Estonian "selling for"
    ];

    for (const { regex, type } of patterns) {
      const match = priceContext.match(regex);
      if (match) {
        if (type === "both") {
          const ahPrice = parseInt(match[1]);
          const okPrice = parseInt(match[2]);
          if (this.isPriceValid(ahPrice) && this.isPriceValid(okPrice)) {
            return {
              price: ahPrice,
              currency: "€",
              ah_price: ahPrice,
              ok_price: okPrice,
            };
          }
        } else {
          const price = parseInt(match[1]);
          if (this.isPriceValid(price)) {
            const result = {
              price: price,
              currency: "€",
            };

            if (type === "ah") {
              result.ah_price = price;
            } else {
              result.ok_price = price;
            }

            return result;
          }
        }
      }
    }

    return null;
  }

  isPriceValid(price) {
    // GPUs typically cost between 50 and 10000 euros
    return price >= 50 && price <= 10000;
  }

  extractAllPricesWithContext(text) {
    const prices = [];
    const pricePatterns = [
      // "AH: 500 OK: 450" pattern
      { regex: /AH[:\s]+(\d{3,4}).*?OK[:\s]+(\d{3,4})/gi, type: "both" },
      // Individual AH price
      { regex: /AH[:\s]+(\d{3,4})(?!\d)/gi, type: "ah" },
      // Individual OK price
      { regex: /OK[:\s]+(\d{3,4})(?!\d)/gi, type: "ok" },
      // "Hind: 500" (Estonian for "price")
      { regex: /[Hh]ind[:\s]+(\d{3,4})(?!\d)/gi, type: "ok" },
      // "H: 500" shorthand
      { regex: /\bH[:\s]+(\d{3,4})(?!\d)/gi, type: "ok" },
      // Euro symbol before or after
      { regex: /€\s*(\d{3,4})(?!\d)/g, type: "euro" },
      { regex: /(\d{3,4})\s*€/g, type: "euro" },
      { regex: /(\d{3,4})\s*[Ee][Uu][Rr](?!\w)/g, type: "euro" },
      // Just numbers that look like prices (300-5000 range)
      { regex: /\b(\d{3,4})\b/g, type: "number" },
    ];

    const foundPrices = new Set(); // Track unique prices

    for (const { regex, type } of pricePatterns) {
      const matches = [...text.matchAll(regex)];

      for (const match of matches) {
        let priceData = null;

        if (type === "both") {
          const ahPrice = parseInt(match[1]);
          const okPrice = parseInt(match[2]);

          if (this.isPriceValid(ahPrice) && this.isPriceValid(okPrice)) {
            const key = `both_${ahPrice}_${okPrice}`;
            if (!foundPrices.has(key)) {
              foundPrices.add(key);
              priceData = {
                price: ahPrice, // Use AH as main price
                currency: "€",
                ah_price: ahPrice,
                ok_price: okPrice,
                position: match.index,
                type: "both",
              };
            }
          }
        } else {
          const price = parseInt(match[1]);

          if (this.isPriceValid(price)) {
            const key = `${type}_${price}`;

            // For plain numbers, check context to see if it's really a price
            if (type === "number") {
              const contextBefore = text.substring(
                Math.max(0, match.index - 20),
                match.index,
              );
              const contextAfter = text.substring(
                match.index + match[0].length,
                Math.min(text.length, match.index + match[0].length + 20),
              );

              // Skip if it looks like a year, quantity, or model number
              if (
                contextBefore.match(/\d{1,2}\.\d{1,2}\./) || // Part of date
                contextAfter.match(/^\s*(GB|gb|MHz|mhz|mm|cm|W|w)/) || // Unit
                contextBefore.match(/(RTX|GTX|RX)\s*$/) || // Part of model number
                (price > 2020 && price < 2030)
              ) {
                // Likely a year
                continue;
              }
            }

            if (!foundPrices.has(key)) {
              foundPrices.add(key);
              priceData = {
                price: price,
                currency: "€",
                position: match.index,
                type: type,
              };

              if (type === "ah") {
                priceData.ah_price = price;
              } else if (type === "ok" || type === "euro") {
                priceData.ok_price = price;
              }
            }
          }
        }

        if (priceData) {
          prices.push(priceData);
        }
      }
    }

    // Sort by position in text
    prices.sort((a, b) => a.position - b.position);

    // Remove duplicate prices at same position
    const uniquePrices = [];
    const seenPositions = new Set();

    for (const price of prices) {
      const posKey = `${Math.floor(price.position / 10)}_${price.price}`;
      if (!seenPositions.has(posKey)) {
        seenPositions.add(posKey);
        uniquePrices.push(price);
      }
    }

    return uniquePrices;
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

  parseEstonianDate(dateString) {
    if (!dateString) return null;

    try {
      // Remove any extra whitespace
      dateString = dateString.trim();

      // Estonian month names
      const estonianMonths = {
        jaanuar: 0,
        jan: 0,
        veebruar: 1,
        veebr: 1,
        feb: 1,
        märts: 2,
        mär: 2,
        mar: 2,
        aprill: 3,
        apr: 3,
        mai: 4,
        juuni: 5,
        jun: 5,
        juuli: 6,
        jul: 6,
        august: 7,
        aug: 7,
        september: 8,
        sept: 8,
        sep: 8,
        oktoober: 9,
        okt: 9,
        oct: 9,
        november: 10,
        nov: 10,
        detsember: 11,
        dets: 11,
        dec: 11,
      };

      // Common date patterns on Estonian forums
      const patterns = [
        // "31. august 2025"
        /(\d{1,2})\.\s*(\w+)\s+(\d{4})/i,
        // "31.08.2025"
        /(\d{1,2})\.(\d{1,2})\.(\d{4})/,
        // "31-08-2025"
        /(\d{1,2})-(\d{1,2})-(\d{4})/,
        // "2025-08-31" (ISO format)
        /(\d{4})-(\d{2})-(\d{2})/,
        // With time: "31.08.2025 14:30"
        /(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})/,
        // "Täna" (today), "Eile" (yesterday)
        /(Täna|Eile|Today|Yesterday)/i,
      ];

      // Try each pattern
      for (const pattern of patterns) {
        const match = dateString.match(pattern);
        if (match) {
          // Handle special cases
          if (match[1] === "Täna" || match[1] === "Today") {
            return new Date().toISOString();
          }
          if (match[1] === "Eile" || match[1] === "Yesterday") {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            return yesterday.toISOString();
          }

          // Handle date with Estonian month name
          if (pattern === patterns[0]) {
            // "31. august 2025"
            const day = parseInt(match[1]);
            const monthName = match[2].toLowerCase();
            const year = parseInt(match[3]);

            const month = estonianMonths[monthName];
            if (month !== undefined) {
              const date = new Date(year, month, day);
              if (!isNaN(date.getTime())) {
                return date.toISOString();
              }
            }
          }

          // Handle DD.MM.YYYY
          if (pattern === patterns[1] || pattern === patterns[2]) {
            const day = parseInt(match[1]);
            const month = parseInt(match[2]) - 1; // JavaScript months are 0-based
            const year = parseInt(match[3]);

            const date = new Date(year, month, day);
            if (!isNaN(date.getTime())) {
              return date.toISOString();
            }
          }

          // Handle YYYY-MM-DD (ISO format)
          if (pattern === patterns[3]) {
            const year = parseInt(match[1]);
            const month = parseInt(match[2]) - 1;
            const day = parseInt(match[3]);

            const date = new Date(year, month, day);
            if (!isNaN(date.getTime())) {
              return date.toISOString();
            }
          }

          // Handle date with time
          if (pattern === patterns[4]) {
            const day = parseInt(match[1]);
            const month = parseInt(match[2]) - 1;
            const year = parseInt(match[3]);
            const hour = parseInt(match[4]);
            const minute = parseInt(match[5]);

            const date = new Date(year, month, day, hour, minute);
            if (!isNaN(date.getTime())) {
              return date.toISOString();
            }
          }
        }
      }

      // Last resort: try to parse with JavaScript's Date constructor
      const fallbackDate = new Date(dateString);
      if (!isNaN(fallbackDate.getTime())) {
        return fallbackDate.toISOString();
      }

      // If all else fails, return null
      console.warn(`Could not parse date: ${dateString}`);
      return null;
    } catch (error) {
      console.error(`Error parsing date "${dateString}":`, error.message);
      return null;
    }
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

          // Extract post date from listing page
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

  // REMOVED generateId method completely since we don't need it anymore

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
      this.updateCallback("🔒 Browser closed");
    }
  }
}

module.exports = GPUForumScraperEnhanced;
