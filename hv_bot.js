const puppeteer = require("puppeteer");
const readline = require("readline");
const setTimeout = require("node:timers/promises");

// Create interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Function to get user input
function getUserInput(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

// Function to get password input (hidden)
function getPasswordInput(question) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const stdout = process.stdout;

    // Write the question
    stdout.write(question);

    let password = "";

    // Mute stdout to prevent any output
    const originalWrite = stdout.write;
    stdout.write = function () {
      return true;
    };

    // Set up stdin for raw input
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    const cleanup = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeAllListeners("data");
      // Restore stdout
      stdout.write = originalWrite;
    };

    const onData = (key) => {
      key = key.toString();

      switch (key) {
        case "\n":
        case "\r":
        case "\u0004": // Ctrl-D (EOT)
          cleanup();
          stdout.write("\n");
          resolve(password);
          break;
        case "\u0003": // Ctrl-C (ETX)
          cleanup();
          stdout.write("\n");
          process.exit(1);
          break;
        case "\u007f": // Backspace
        case "\b": // Backspace
          if (password.length > 0) {
            password = password.slice(0, -1);
          }
          break;
        default:
          // Add printable characters only
          if (key.charCodeAt(0) >= 32 && key.charCodeAt(0) < 127) {
            password += key;
          }
          break;
      }
    };

    stdin.on("data", onData);
  });
}

// Main bot function
async function runForumBot() {
  let browser;

  try {
    console.log("Starting Hinnavaatlus Forum Bot...\n");

    // Get login credentials from user
    const username = await getUserInput("Enter your username: ");
    const password = await getPasswordInput("Enter your password: ");

    console.log("\nLaunching browser...");
    browser = await puppeteer.launch({
      headless: false, // Set to true if you don't want to see the browser
      defaultViewport: null,
    });

    const page = await browser.newPage();

    // Navigate to login page
    console.log("Navigating to login page...");
    await page.goto("https://auth.hinnavaatlus.ee/ui/login", {
      waitUntil: "networkidle2",
    });

    // Wait for login form to load and fill credentials
    console.log("Logging in...");
    try {
      // Wait for the identifier field and type username
      await page.waitForSelector('input[name="identifier"]', {
        timeout: 10000,
      });
      await page.type('input[name="identifier"]', username);

      // Wait for password field and type password
      await page.waitForSelector('input[name="password"]', { timeout: 5000 });
      await page.type('input[name="password"]', password);

      // Submit the form
      await page.click(
        'body > div > section > div > div > div > form:nth-child(5) > button[type="submit"]',
      );

      // Wait for navigation after login
      await page.waitForNavigation({
        waitUntil: "networkidle2",
        timeout: 10000,
      });
    } catch (error) {
      console.error("Login form not found or login failed:", error.message);
      return;
    }

    // Check if login was successful
    const currentUrl = page.url();
    if (
      currentUrl.includes("foorum.hinnavaatlus.ee") ||
      !currentUrl.includes("login")
    ) {
      console.log("Login successful!");
    } else {
      console.log("Login failed - still on login page");
      return;
    }

    // Navigate to "My Posts" page
    console.log("Navigating to your posts...");
    await page.goto(
      "https://foorum.hinnavaatlus.ee/search.php?search_id=egosearch",
      { waitUntil: "networkidle2" },
    );

    // Wait for the posts page to load
    await page.waitForSelector("table", { timeout: 10000 });

    // Find threads where both Author and Last Post are by you, and threads where you're author but not last poster
    console.log("Finding your threads...");
    const { threadsToEdit, threadsToComment } = await page.evaluate(
      (username) => {
        const threadsToEdit = [];
        const threadsToComment = [];
        const forumTable = document.querySelector(
          "body > table > tbody > tr > td > table.forumline",
        );

        if (!forumTable) {
          console.log("Forum table not found");
          return { threadsToEdit, threadsToComment };
        }

        const rows = forumTable.querySelectorAll("tbody > tr");
        console.log(`Found ${rows.length} rows in forum table`);

        // Process data rows (starting from row 4, index 3)
        rows.forEach((row, index) => {
          // Skip header rows (first 3 rows: index 0, 1, 2)
          if (index < 3) return;

          try {
            const cells = row.querySelectorAll("td");
            if (cells.length < 7) return;

            // Get thread title and URL from any of the first few columns
            let threadTitle = "";
            let titleLink = null;
            for (let i = 0; i < 4; i++) {
              const link = cells[i]
                ? cells[i].querySelector('a[href*="viewtopic.php"]')
                : null;
              if (link) {
                threadTitle = link.textContent.trim();
                titleLink = link;
                break;
              }
            }

            if (!titleLink) return; // Skip if no thread link found

            // Get author from column 5 (td:nth-child(5) > span > a)
            const authorCell = cells[4]; // 5th column = index 4
            const authorLink = authorCell
              ? authorCell.querySelector("span > a")
              : null;
            const authorText = authorLink ? authorLink.textContent.trim() : "";

            // Get last poster from column 7 (td:nth-child(7) > span > a:nth-child(2))
            const lastPostCell = cells[6]; // 7th column = index 6
            const lastPostLink = lastPostCell
              ? lastPostCell.querySelector("span > a:nth-child(2)")
              : null;
            const lastPostText = lastPostLink
              ? lastPostLink.textContent.trim()
              : "";

            // Get the "viimane postitus" link from the last post cell
            const lastPostDirectLink = lastPostCell
              ? lastPostCell.querySelector('a[href*="viewtopic.php"]')
              : null;
            const lastPostUrl = lastPostDirectLink
              ? lastPostDirectLink.href
              : titleLink.href;

            console.log(
              `Row ${index + 1}: Title="${threadTitle}", Author="${authorText}", LastPoster="${lastPostText}"`,
            );

            // Check if both author and last poster match the username
            if (authorText === username && lastPostText === username) {
              threadsToEdit.push({
                title: threadTitle,
                lastPostUrl: lastPostUrl,
                rowIndex: index + 1,
                authorText: authorText,
                lastPostText: lastPostText,
              });
              console.log(`Edit match found: "${threadTitle}"`);
            }
            // Check if you're the author but NOT the last poster
            else if (
              authorText === username &&
              lastPostText !== username &&
              lastPostText !== ""
            ) {
              threadsToComment.push({
                title: threadTitle,
                threadUrl: lastPostUrl,
                rowIndex: index + 1,
                authorText: authorText,
                lastPostText: lastPostText,
              });
              console.log(
                `Comment match found: "${threadTitle}" (last poster: ${lastPostText})`,
              );
            }
          } catch (e) {
            console.log(`Error processing row ${index + 1}:`, e.message);
          }
        });

        return { threadsToEdit, threadsToComment };
      },
      username,
    );

    if (threadsToEdit.length === 0 && threadsToComment.length === 0) {
      console.log("No threads found to process");
      return;
    }

    console.log(
      `Found ${threadsToEdit.length} threads to edit and ${threadsToComment.length} threads to comment on`,
    );

    // Process threads to edit (where you're both author and last poster)
    for (let i = 0; i < threadsToEdit.length; i++) {
      const thread = threadsToEdit[i];
      console.log(
        `\nEditing thread ${i + 1}/${threadsToEdit.length}: "${thread.title}"`,
      );

      try {
        // Navigate directly to the last post using the "viimane postitus" link
        console.log("Opening thread at last post...");
        await page.goto(thread.lastPostUrl, { waitUntil: "networkidle2" });

        // Find the last post by your username and get its edit link
        console.log("Looking for your last post in the thread...");
        const editUrl = await page.evaluate((username) => {
          // Look for all posts by the user on this page
          const postRows = [];
          const allRows = document.querySelectorAll("tr");

          // Find rows that contain the username
          allRows.forEach((row, index) => {
            const rowText = row.textContent;
            if (rowText.includes(username)) {
              // Check if this row or nearby rows contain post content/edit links
              const hasEditLink =
                row.querySelector('a[href*="posting.php?mode=editpost"]') ||
                row.querySelector('a[href*="mode=editpost"]');

              // Also check next few rows for edit links
              let editLink = hasEditLink;
              if (!editLink) {
                for (let i = 1; i <= 3; i++) {
                  const nextRow = allRows[index + i];
                  if (nextRow) {
                    editLink =
                      nextRow.querySelector(
                        'a[href*="posting.php?mode=editpost"]',
                      ) || nextRow.querySelector('a[href*="mode=editpost"]');
                    if (editLink) break;
                  }
                }
              }

              if (editLink) {
                postRows.push({
                  row: row,
                  editLink: editLink.href,
                  index: index,
                });
              }
            }
          });

          // Return the last (highest index) edit link found
          if (postRows.length > 0) {
            const lastPost = postRows[postRows.length - 1];
            console.log(
              `Found ${postRows.length} post(s) by ${username}, using last one at row ${lastPost.index}`,
            );
            return lastPost.editLink;
          }

          return null;
        }, username);

        if (!editUrl) {
          console.log(
            `Could not find edit link for your post in "${thread.title}" - skipping`,
          );
          continue;
        }

        console.log("Found edit link, navigating to edit page...");

        // Navigate to edit page
        await page.goto(editUrl, { waitUntil: "networkidle2" });

        // Look for save/submit button on edit page
        console.log("Looking for save button...");
        let saveButton = null;
        const saveSelectors = [
          'input[name="post"]',
          'input[value*="Submit"]',
          'input[value*="Postita"]',
          'input[value*="Salvesta"]',
          'input[value*="Sisesta"]',
          'input[type="submit"]',
          'button[type="submit"]',
        ];

        for (const selector of saveSelectors) {
          try {
            const buttons = await page.$$(selector);
            for (const button of buttons) {
              // Get button text/value to verify it's the submit button
              const buttonText = await page.evaluate((btn) => {
                return btn.value || btn.textContent || btn.innerText || "";
              }, button);

              if (
                buttonText &&
                (buttonText.toLowerCase().includes("submit") ||
                  buttonText.toLowerCase().includes("post") ||
                  buttonText.toLowerCase().includes("sisesta") ||
                  buttonText.toLowerCase().includes("postita") ||
                  buttonText.toLowerCase().includes("salvesta") ||
                  buttonText.toLowerCase().includes("save"))
              ) {
                saveButton = button;
                console.log(`Found save button with text: "${buttonText}"`);
                break;
              }
            }
            if (saveButton) break;
          } catch (e) {
            // Try next selector
          }
        }

        if (!saveButton) {
          console.log(`Save button not found for "${thread.title}" - skipping`);
          continue;
        }

        // Click save button
        console.log("Saving post...");
        await saveButton.click();

        // Wait for navigation or response
        try {
          await page.waitForNavigation({
            waitUntil: "networkidle2",
            timeout: 10000,
          });
        } catch (e) {
          // Try next selector
        }

        console.log(`Updated post in "${thread.title}"`);
      } catch (error) {
        console.log(`Error processing "${thread.title}": ${error.message}`);
      }
    }

    // Process threads to comment on (where you're author but not last poster)
    for (let i = 0; i < threadsToComment.length; i++) {
      const thread = threadsToComment[i];
      console.log(
        `\nCommenting on thread ${i + 1}/${threadsToComment.length}: "${thread.title}"`,
      );

      try {
        // Navigate to the thread
        console.log("Opening thread...");
        await page.goto(thread.threadUrl, { waitUntil: "networkidle2" });

        // Find the quick reply textarea and type "(y)"
        console.log("Looking for quick reply textarea...");

        // Try multiple possible selectors for the textarea
        const textAreaSelectors = [
          "body > table > tbody > tr > td > table:nth-child(6) > tbody > tr:nth-child(2) > td > textarea",
          'textarea[name="message"]',
          "textarea",
          "form textarea",
        ];

        let textArea = null;
        for (const selector of textAreaSelectors) {
          try {
            textArea = await page.$(selector);
            if (textArea) {
              console.log(`Found textarea with selector: ${selector}`);
              break;
            }
          } catch (e) {
            // Try next selector
          }
        }

        if (!textArea) {
          console.log(
            `Quick reply textarea not found for "${thread.title}" - skipping`,
          );
          continue;
        }

        // Click textarea to focus and type "(y)"
        await textArea.click();
        await textArea.type("(y)");
        console.log("Typed (y) in quick reply box");

        // Look for submit button
        console.log("Looking for submit button...");
        let submitButton = null;
        const submitSelectors = [
          'input[name="post"]',
          'input[value*="Sisesta"]',
          'input[value*="Submit"]',
          'input[value*="Postita"]',
          'input[type="submit"]',
          'button[type="submit"]',
        ];

        for (const selector of submitSelectors) {
          try {
            const buttons = await page.$$(selector);
            for (const button of buttons) {
              // Get button text/value to verify it's the submit button
              const buttonText = await page.evaluate((btn) => {
                return btn.value || btn.textContent || btn.innerText || "";
              }, button);

              if (
                buttonText &&
                (buttonText.toLowerCase().includes("submit") ||
                  buttonText.toLowerCase().includes("post") ||
                  buttonText.toLowerCase().includes("sisesta") ||
                  buttonText.toLowerCase().includes("postita"))
              ) {
                submitButton = button;
                console.log(`Found submit button with text: "${buttonText}"`);
                break;
              }
            }
            if (submitButton) break;
          } catch (e) {
            // Try next selector
          }
        }

        if (!submitButton) {
          console.log(
            `Submit button not found for "${thread.title}" - skipping`,
          );
          continue;
        }

        // Click submit button
        console.log("Submitting comment...");
        await submitButton.click();

        // Wait for navigation or response
        try {
          await page.waitForNavigation({
            waitUntil: "networkidle2",
            timeout: 10000,
          });
        } catch (e) {
          // Try next selector
        }

        console.log(`Added comment to "${thread.title}"`);
      } catch (error) {
        console.log(`Error commenting on "${thread.title}": ${error.message}`);
      }
    }

    console.log("\nAll accessible threads have been processed!");
  } catch (error) {
    console.error("Bot error:", error.message);
  } finally {
    if (browser) {
      await browser.close();
    }
    rl.close();
    console.log("Browser closed");
  }
}

// Run the bot
runForumBot().catch(console.error);
