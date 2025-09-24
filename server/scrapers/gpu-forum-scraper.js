// server/scrapers/gpu-forum-scraper.js - Fixed navigation and pagination
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
    const { maxPages = 20, headless = true } = options;

    try {
      this.updateCallback("🚀 Starting GPU Forum Scraper...");

      await this.launchBrowser(headless);
      await this.login(username, password);

      this.updateCallback("📄 Navigating to forum sell section...");

      let currentPage = 1;
      let startOffset = 0;
      const threadsPerPage = 25;

      while (currentPage <= maxPages) {
        // Navigate to page with specific offset
        const pageUrl = `https://foorum.hinnavaatlus.ee/viewforum.php?f=3&topicdays=0&start=${startOffset}`;

        this.updateCallback(
          `📄 Navigating to page ${currentPage} (offset ${startOffset})...`,
        );

        await this.page.goto(pageUrl, {
          waitUntil: "networkidle2",
          timeout: 30000,
        });

        // Wait a bit for page to fully load
        await this.page.waitForTimeout(2000);

        // Check if we have threads on this page
        const hasThreads = await this.page.evaluate(() => {
          const rows = document.querySelectorAll("table.forumline tbody tr");
          let threadCount = 0;
          for (let i = 4; i < rows.length; i++) {
            const titleLink = rows[i].querySelector(
              "span.topictitle a.topictitle",
            );
            if (titleLink && !titleLink.textContent.includes("Teadeanne")) {
              threadCount++;
            }
          }
          return threadCount > 0;
        });

        if (!hasThreads) {
          this.updateCallback(
            `No more threads found. Stopping at page ${currentPage}.`,
          );
          break;
        }

        // Get Videokaardid threads on current page
        const videokaardidThreads = await this.getVideokaardidThreads();

        this.updateCallback(
          `🎯 Found ${videokaardidThreads.length} Videokaardid threads on page ${currentPage}`,
        );

        // Process each thread
        for (let i = 0; i < videokaardidThreads.length; i++) {
          const thread = videokaardidThreads[i];

          if (this.processedThreads.has(thread.url)) {
            continue;
          }

          this.updateCallback(
            `🔍 Processing thread ${i + 1}/${videokaardidThreads.length}: ${thread.title.substring(0, 40)}...`,
          );

          try {
            // Navigate to thread
            await this.page.goto(thread.url, {
              waitUntil: "networkidle2",
              timeout: 20000,
            });

            // Scrape thread content
            const threadData = await this.extractThreadData();
            const fullText = `${thread.title} ${threadData.content}`;

            // Extract GPUs and prices
            const gpuListings = this.extractAllGPUsWithPrices(fullText);

            if (gpuListings.length === 0) {
              // Try to extract at least GPU model from title
              const gpuFromTitle = this.extractGPUFromTitle(thread.title);
              const prices = this.extractAllPrices(fullText);

              if (gpuFromTitle && prices.length > 0) {
                gpuListings.push({
                  model: gpuFromTitle,
                  ...prices[0],
                });
              }
            }

            if (gpuListings.length > 0) {
              // Use location from thread or extract from content
              let location = thread.location;
              if (!location) {
                location = this.extractLocation(fullText);
              }

              // Save GPU data
              for (const gpu of gpuListings) {
                this.gpuData.push({
                  id: this.generateId(thread.url) + "_" + Date.now(),
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

                this.updateCallback(`✅ Found: ${gpu.model} - ${priceStr}`);
              }
            }

            this.processedThreads.add(thread.url);

            // IMPORTANT: Navigate back to the listing page
            this.updateCallback(`↩️ Returning to listings page...`);
            await this.page.goto(pageUrl, {
              waitUntil: "networkidle2",
              timeout: 30000,
            });

            // Wait a bit before processing next thread
            await this.page.waitForTimeout(1000);
          } catch (error) {
            this.updateCallback(`⚠️ Error in thread: ${error.message}`);

            // Try to navigate back to listing page even on error
            try {
              await this.page.goto(pageUrl, {
                waitUntil: "networkidle2",
                timeout: 30000,
              });
            } catch (navError) {
              this.updateCallback(
                `❌ Failed to return to listings: ${navError.message}`,
              );
            }
          }
        }

        // Move to next page
        this.updateCallback(`✅ Completed page ${currentPage}`);
        currentPage++;
        startOffset += threadsPerPage;

        // Small delay before next page
        await this.page.waitForTimeout(2000);
      }

      this.updateCallback(
        `🏁 Scraping complete! Found ${this.gpuData.length} GPU listings across ${currentPage - 1} pages`,
      );

      return {
        success: true,
        data: this.gpuData,
        totalListings: this.gpuData.length,
        processedThreads: this.processedThreads.size,
        processedPages: currentPage - 1,
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
    return await this.page.evaluate(() => {
      const threads = [];
      const rows = document.querySelectorAll("table.forumline tbody tr");

      for (let i = 3; i < rows.length; i++) {
        const row = rows[i];

        try {
          const titleLink = row.querySelector("span.topictitle a.topictitle");
          if (!titleLink) continue;

          if (titleLink.textContent.includes("Teadeanne")) {
            continue;
          }

          const topicTitleElement = row.querySelector("span.topictitle");
          if (!topicTitleElement) continue;

          let isVideokaardid = false;
          let location = null;

          const fullText =
            topicTitleElement.textContent || topicTitleElement.innerText || "";
          if (fullText.includes("Videokaardid")) {
            isVideokaardid = true;
          }

          const allSpans = topicTitleElement.querySelectorAll("span");
          allSpans.forEach((span) => {
            const text = span.textContent.trim();
            if (text === "Videokaardid" || text.includes("Videokaardid")) {
              isVideokaardid = true;
            } else if (
              text &&
              text.length > 2 &&
              !text.includes("Videokaardid") &&
              !text.includes("span") &&
              text !== "i" &&
              !text.includes("class")
            ) {
              const cleanText = text.replace(/^Asukoht:?\s*/i, "").trim();
              if (cleanText.length > 2 && cleanText.length < 30) {
                location = cleanText;
              }
            }
          });

          const italicElements = topicTitleElement.querySelectorAll("i");
          italicElements.forEach((elem) => {
            const text = elem.textContent.trim();
            if (text === "Videokaardid" || text.includes("Videokaardid")) {
              isVideokaardid = true;
            } else if (
              text &&
              text.length > 2 &&
              text.length < 30 &&
              !text.includes("Videokaardid")
            ) {
              location = text.replace(/^Asukoht:?\s*/i, "").trim();
            }
          });

          if (isVideokaardid) {
            const title = titleLink.textContent.trim();
            const url = titleLink.href;

            let author = "Unknown";
            const authorCell = row.cells[3];
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
        } catch (e) {
          console.warn("Error processing row:", e.message);
        }
      }

      return threads;
    });
  }

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
      /RX\s*7[0-9]00\s*(XT|XTX)?/gi,
      /RX\s*6[0-9]00\s*(XT|XTX)?/gi,
      /RX\s*5[0-9]00\s*(XT)?/gi,
      /RX\s*5[5-8]0/gi,
      /RX\s*4[7-8]0/gi,
      /ARC\s*A[0-9]{3,4}/gi,
    ];

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

    return Array.from(foundGPUs);
  }

  extractAllPrices(text) {
    const prices = [];

    let ahPrice = null;
    let okPrice = null;
    let euroPrice = null;

    const ahMatch = text.match(/AH[:\s]*(\d+)/i);
    if (ahMatch) {
      ahPrice = parseInt(ahMatch[1]);
    }

    const okMatch = text.match(/OK[:\s]*(\d+)/i);
    if (okMatch) {
      okPrice = parseInt(okMatch[1]);
    }

    const euroMatches = [
      ...text.matchAll(/€\s*(\d+(?:[,\.]\d{1,2})?)/g),
      ...text.matchAll(/(\d+(?:[,\.]\d{1,2})?)\s*€/g),
      ...text.matchAll(/HIND[:\s]*(\d+)/gi),
      ...text.matchAll(/MÜÜK[:\s]*(\d+)/gi),
    ];

    for (const match of euroMatches) {
      const price = parseFloat(match[1].replace(",", "."));
      if (!isNaN(price) && price >= 50 && price <= 5000) {
        euroPrice = Math.round(price);
        break;
      }
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

    if (prices.length === 0) {
      const fallbackMatches = text.matchAll(/(\d{2,4})(?:\D|$)/g);
      for (const match of fallbackMatches) {
        const price = parseInt(match[1]);
        if (price >= 50 && price <= 5000) {
          prices.push({
            price: price,
            currency: "€",
            ah_price: null,
            ok_price: null,
          });
          break;
        }
      }
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
