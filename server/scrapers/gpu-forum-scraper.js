// server/scrapers/gpu-forum-scraper.js - Fixed pagination and PC build detection
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
    const { maxPages = 20, maxThreadsPerPage = 50, headless = true } = options;

    try {
      this.updateCallback("🚀 Starting Enhanced GPU Forum Scraper...");

      await this.launchBrowser(headless);
      await this.login(username, password);

      // Navigate to initial page
      await this.page.goto("https://foorum.hinnavaatlus.ee/viewforum.php?f=3", {
        waitUntil: "networkidle2",
        timeout: 30000,
      });

      await this.scrapeAllPages(maxPages, maxThreadsPerPage);

      this.updateCallback(
        `✅ Scraping complete! Found ${this.gpuData.length} GPU listings`,
      );

      return {
        success: true,
        data: this.gpuData,
        totalListings: this.gpuData.length,
        processedThreads: this.processedThreads.size,
        processedPages:
          this.processedThreads.size > 0
            ? Math.ceil(this.processedThreads.size / 25)
            : 0,
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

  async scrapeAllPages(maxPages, maxThreadsPerPage) {
    let currentPage = 1;
    let startOffset = 0;
    const INCREMENT = 25;

    while (currentPage <= maxPages) {
      this.updateCallback(`📄 Scraping page ${currentPage}/${maxPages}...`);

      // Navigate to specific page using start parameter
      const pageUrl = `https://foorum.hinnavaatlus.ee/viewforum.php?f=3&topicdays=0&start=${startOffset}`;

      await this.page.goto(pageUrl, {
        waitUntil: "networkidle2",
        timeout: 30000,
      });

      // Wait for table to load
      try {
        await this.page.waitForSelector("table.forumline", { timeout: 10000 });
      } catch (error) {
        this.updateCallback(`No content found on page ${currentPage}`);
        break;
      }

      // Get all thread links from current page
      const threadLinks = await this.getThreadLinks();

      if (threadLinks.length === 0) {
        this.updateCallback(`No threads found on page ${currentPage}`);
        break;
      }

      this.updateCallback(
        `Found ${threadLinks.length} threads on page ${currentPage}`,
      );

      let processedCount = 0;
      let gpusFoundOnPage = 0;

      // Process each thread
      for (const thread of threadLinks) {
        if (processedCount >= maxThreadsPerPage) break;
        if (this.processedThreads.has(thread.url)) continue;

        const found = await this.scrapeThread(thread);
        if (found) {
          gpusFoundOnPage++;
        }

        this.processedThreads.add(thread.url);
        processedCount++;

        // Small delay between threads to avoid being blocked
        await this.page.waitForTimeout(500);
      }

      this.updateCallback(
        `Page ${currentPage}: Found ${gpusFoundOnPage} GPU listings`,
      );

      // Check if there's a next page
      const hasNextPage = await this.page.evaluate(() => {
        // Look for "Järgmine" (Next) link
        const links = Array.from(document.querySelectorAll("a"));
        return links.some((link) => link.textContent.includes("Järgmine"));
      });

      if (!hasNextPage) {
        this.updateCallback(`Reached last page at page ${currentPage}`);
        break;
      }

      currentPage++;
      startOffset += INCREMENT;
    }

    this.updateCallback(
      `Processed ${currentPage} pages, found ${this.gpuData.length} GPU listings`,
    );
  }

  async getThreadLinks() {
    return await this.page.evaluate(() => {
      const threads = [];
      let rows = document.querySelectorAll("table.forumline tr");

      if (rows.length === 0) {
        rows = document.querySelectorAll("table tr");
      }

      // Skip header rows (usually first 3)
      for (let i = 3; i < rows.length; i++) {
        const row = rows[i];
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
      // Pre-filter: Skip if title suggests full PC build
      if (this.isFullPCBuild(thread.title)) {
        this.updateCallback(
          `⏭️ Skipping PC build: ${thread.title.substring(0, 30)}...`,
        );
        return false;
      }

      // Quick GPU check
      const titleHasGPU = this.quickGPUCheck(thread.title);

      if (!titleHasGPU) {
        this.updateCallback(
          `⏭️ Skipping non-GPU thread: ${thread.title.substring(0, 30)}...`,
        );
        return false;
      }

      this.updateCallback(`🔍 Processing: ${thread.title.substring(0, 50)}...`);

      // Navigate to thread
      await this.page.goto(thread.url, {
        waitUntil: "networkidle2",
        timeout: 20000,
      });

      const threadData = await this.extractThreadData();
      const fullText = `${thread.title} ${threadData.content}`;

      // Extract location from both title and content
      let location = this.extractLocation(thread.title);
      if (!location) {
        location = this.extractLocation(threadData.content);
      }

      // More thorough PC build check
      if (this.isFullPCBuild(fullText)) {
        this.updateCallback(
          `⏭️ Skipping PC build (detected in content): ${thread.title.substring(0, 30)}...`,
        );
        return false;
      }

      // Extract multiple GPUs and their prices
      const gpuListings = this.extractMultipleGPUs(fullText);

      if (gpuListings.length > 0) {
        for (const listing of gpuListings) {
          const gpuEntry = {
            id:
              this.generateId(thread.url) +
              "_" +
              Math.random().toString(36).substr(2, 9),
            model: listing.model,
            brand: this.detectBrand(listing.model),
            price: listing.price,
            currency: listing.currency,
            title: thread.title,
            url: thread.url,
            author: thread.author,
            location: location,
            scraped_at: new Date().toISOString(),
          };

          this.gpuData.push(gpuEntry);
          this.updateCallback(
            `✅ Found: ${listing.model} - ${listing.price}${listing.currency} (${location || "Location unknown"})`,
          );
        }

        return true;
      } else {
        this.updateCallback(
          `⚠️ No GPU/price found in: ${thread.title.substring(0, 30)}...`,
        );
        return false;
      }
    } catch (error) {
      this.updateCallback(`❌ Error scraping thread: ${error.message}`);
      return false;
    }
  }

  isFullPCBuild(text) {
    const upperText = text.toUpperCase();

    // Keywords that indicate full PC build
    const pcBuildKeywords = [
      "KOMPLEKT",
      "FULL PC",
      "KOGU ARVUTI",
      "GAMING PC",
      "ARVUTI KOMPLEKT",
      "PC BUILD",
      "TÄISARVUTI",
      "COMPLETE PC",
      "KOGU KOMPLEKT",
      "TERVE ARVUTI",
      "GAMING ARVUTI",
    ];

    // Check for explicit PC build keywords
    for (const keyword of pcBuildKeywords) {
      if (upperText.includes(keyword)) {
        return true;
      }
    }

    // Component keywords that when combined suggest PC build
    const components = {
      cpu: [
        "CPU",
        "PROTSESSOR",
        "PROCESSOR",
        "RYZEN",
        "INTEL CORE",
        "I5",
        "I7",
        "I9",
      ],
      mobo: ["EMAPLAAT", "MOTHERBOARD", "MAINBOARD", "MOBO", "MB"],
      ram: ["RAM", "MÄLU", "MEMORY", "DDR", "OPERATIIVMÄLU"],
      psu: ["TOITEPLOKK", "POWER SUPPLY", "PSU", "WATT", "TOIDE"],
      case: ["KORPUS", "TOWER", "CHASSIS", "CASE"],
      storage: ["SSD", "KÕVAKETAS", "HDD", "STORAGE", "NVME", "KETAS"],
    };

    // Count how many different component types are mentioned
    let componentCount = 0;
    for (const [type, keywords] of Object.entries(components)) {
      for (const keyword of keywords) {
        if (upperText.includes(keyword)) {
          componentCount++;
          break; // Only count each component type once
        }
      }
    }

    // If 4 or more different components mentioned, likely a PC build
    // Also check if it has both CPU and motherboard which strongly indicates PC build
    const hasCPU = components.cpu.some((k) => upperText.includes(k));
    const hasMobo = components.mobo.some((k) => upperText.includes(k));

    return componentCount >= 4 || (hasCPU && hasMobo && componentCount >= 3);
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
      "GRAPHICS",
      "VIDEO KAART",
      "GRAAFIKA",
      "1060",
      "1070",
      "1080",
      "1650",
      "1660",
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
      /ASUKOHT[:\s]*([A-ZÄÖÜÕ\s,]+)/,
    ];

    // Try patterns first
    for (const pattern of locationPatterns) {
      const match = upperText.match(pattern);
      if (match) {
        const locationText = match[1].trim();
        // Check if it's a valid city
        for (const city of cities) {
          if (locationText.includes(city)) {
            // Return with proper casing
            return city.charAt(0) + city.slice(1).toLowerCase();
          }
        }
      }
    }

    // Direct city search in text (fallback)
    for (const city of cities) {
      // Check with word boundaries to avoid false matches
      const cityPattern = new RegExp(`\\b${city}\\b`);
      if (cityPattern.test(upperText)) {
        return city.charAt(0) + city.slice(1).toLowerCase();
      }
    }

    return null;
  }

  extractMultipleGPUs(text) {
    const gpuListings = [];
    const upperText = text.toUpperCase();

    // GPU patterns
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
    ];

    // Find all GPU models
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

    // For each GPU, try to find its price
    for (const gpu of foundGPUs) {
      // Create a text segment around the GPU mention to find its price
      const gpuIndex = upperText.indexOf(gpu);

      if (gpuIndex !== -1) {
        // Get text within ~200 characters of the GPU mention
        const contextStart = Math.max(0, gpuIndex - 100);
        const contextEnd = Math.min(text.length, gpuIndex + gpu.length + 100);
        const context = text.substring(contextStart, contextEnd);

        const priceData = this.extractPrice(context);

        if (priceData) {
          gpuListings.push({
            model: gpu,
            price: priceData.price,
            currency: priceData.currency,
          });
        }
      }
    }

    // If multiple GPUs but only one price found, check if it's a combined listing
    if (foundGPUs.size > 1 && gpuListings.length === 1) {
      // Look for "koos" (together) or similar keywords
      if (
        upperText.includes("KOOS") ||
        upperText.includes("KOKKU") ||
        upperText.includes("KOMPLEKT")
      ) {
        // This is likely a bundle, skip or mark accordingly
        return [];
      }
    }

    return gpuListings;
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
