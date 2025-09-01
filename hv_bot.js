const puppeteer = require('puppeteer');
const readline = require('readline');
const setTimeout = require('node:timers/promises');

// Create interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Function to get user input
function getUserInput(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

// Function to get password input
function getPasswordInput(question) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    
    stdout.write(question);
    
    let password = '';
    
    // Mute stdout to prevent any output
    const originalWrite = stdout.write;
    stdout.write = function() { return true; };
    
    // Set up stdin for raw input
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    
    const cleanup = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeAllListeners('data');
      // Restore stdout
      stdout.write = originalWrite;
    };
    
    const onData = (key) => {
      key = key.toString();
      
      switch (key) {
        case '\n':
        case '\r':
        case '\u0004': // Ctrl-D (EOT)
          cleanup();
          stdout.write('\n');
          resolve(password);
          break;
        case '\u0003': // Ctrl-C (ETX)
          cleanup();
          stdout.write('\n');
          process.exit(1);
          break;
        case '\u007f': // Backspace
        case '\b': // Backspace
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
    
    stdin.on('data', onData);
  });
}

// Main bot function
async function runForumBot() {
  let browser;
  
  try {
    console.log('Starting Hinnavaatlus Forum Bot...\n');
    
    // Get login credentials from user
    const username = await getUserInput('Enter your username: ');
    const password = await getPasswordInput('Enter your password: ');
    
    console.log('\nLaunching browser...');
    browser = await puppeteer.launch({ 
      headless: false, // Set to true if you don't want to see the browser
      defaultViewport: null 
    });
    
    const page = await browser.newPage();
    
    // Navigate to login page
    console.log('Navigating to login page...');
    await page.goto('https://auth.hinnavaatlus.ee/ui/login', { waitUntil: 'networkidle2' });
    
    // Wait for login form to load and fill credentials
    console.log('Logging in...');
    try {
      // Wait for the identifier field and type username
      await page.waitForSelector('input[name="identifier"]', { timeout: 10000 });
      await page.type('input[name="identifier"]', username);
      
      // Wait for password field and type password
      await page.waitForSelector('input[name="password"]', { timeout: 5000 });
      await page.type('input[name="password"]', password);
      
      // Submit the form
      await page.click('body > div > section > div > div > div > form:nth-child(5) > button[type="submit"]');
      
      // Wait for navigation after login
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 });
      
    } catch (error) {
      console.error('Login form not found or login failed:', error.message);
      return;
    }
    
    // Check if login was successful
    const currentUrl = page.url();
    if (currentUrl.includes('foorum.hinnavaatlus.ee') || !currentUrl.includes('login')) {
      console.log('Login successful!');
    } else {
      console.log('Login failed - still on login page');
      return;
    }
    
    // Navigate to "My Posts" page
    console.log('Navigating to your posts...');
    await page.goto('https://foorum.hinnavaatlus.ee/search.php?search_id=egosearch', { waitUntil: 'networkidle2' });
    
    // Wait for the posts page to load
    await page.waitForSelector('table', { timeout: 10000 });
    
    // Find threads where both Author and Last Post are by you
    console.log('Finding threads where you are both author and last poster...');
    const threadsToEdit = await page.evaluate((username) => {
      const threads = [];
      const forumTable = document.querySelector('body > table > tbody > tr > td > table.forumline');
      
      if (!forumTable) {
        console.log('Forum table not found');
        return threads;
      }
      
      const rows = forumTable.querySelectorAll('tbody > tr');
      console.log(`Found ${rows.length} rows in forum table`);
      
      // Process data rows (starting from row 4, index 3)
      rows.forEach((row, index) => {
        // Skip header rows (first 3 rows: index 0, 1, 2)
        if (index < 3) return;
        
        try {
          const cells = row.querySelectorAll('td');
          if (cells.length < 7) return;
          
          // Get title cell - look for viewtopic.php link in early columns
          let titleLink = null;
          for (let i = 0; i < 4; i++) {
            const link = cells[i] ? cells[i].querySelector('a[href*="viewtopic.php"]') : null;
            if (link) {
              titleLink = link;
              break;
            }
          }
          
          if (!titleLink) return;
          
          // Get author from column 5 (td:nth-child(5) > span > a)
          const authorCell = cells[4]; // 5th column = index 4
          const authorLink = authorCell ? authorCell.querySelector('span > a') : null;
          const authorText = authorLink ? authorLink.textContent.trim() : '';
          
          // Get last poster from column 7 (td:nth-child(7) > span > a:nth-child(2))
          const lastPostCell = cells[6]; // 7th column = index 6
          const lastPostLink = lastPostCell ? lastPostCell.querySelector('span > a:nth-child(2)') : null;
          const lastPostText = lastPostLink ? lastPostLink.textContent.trim() : '';
          
          console.log(`Row ${index + 1}: Title="${titleLink.textContent.trim()}", Author="${authorText}", LastPoster="${lastPostText}"`);
          
          // Check if both author and last poster match the username
          if (authorText === username && lastPostText === username) {
            threads.push({
              title: titleLink.textContent.trim(),
              threadUrl: titleLink.href,
              rowIndex: index + 1,
              authorText: authorText,
              lastPostText: lastPostText
            });
            console.log(`Match found: "${titleLink.textContent.trim()}"`);
          }
        } catch (e) {
          console.log(`Error processing row ${index + 1}:`, e.message);
        }
      });
      
      return threads;
    }, username);
    
    if (threadsToEdit.length === 0) {
      console.log('No threads found where you are both author and last poster');
      return;
    }
    
    console.log(`Found ${threadsToEdit.length} threads to edit`);    
    // Process each thread
    for (let i = 0; i < threadsToEdit.length; i++) {
      const thread = threadsToEdit[i];
      console.log(`\nProcessing thread ${i + 1}/${threadsToEdit.length}: "${thread.title}"`);
      
      try {
        // Navigate to the thread
        console.log('Opening thread...');
        await page.goto(thread.threadUrl, { waitUntil: 'networkidle2' });
        
        // Find the last post by your username and get its edit link
        console.log('Looking for your last post in the thread...');
        const editUrl = await page.evaluate((username) => {
          // Find all post rows in the thread
          const postTables = document.querySelectorAll('table');
          let lastEditUrl = null;
          
          // Look through all tables to find post tables
          postTables.forEach(table => {
            const rows = table.querySelectorAll('tr');
            
            rows.forEach(row => {
              // Look for rows that contain username and edit links
              const rowText = row.textContent;
              
              if (rowText.includes(username)) {
                // Look for edit link in this row or nearby rows
                const editLink = row.querySelector('a[href*="posting.php?mode=editpost"]') ||
                                row.querySelector('a[href*="mode=editpost"]');
                
                if (editLink) {
                  lastEditUrl = editLink.href;
                }
                
                // Also check next row for edit links (sometimes they're in the row below)
                const nextRow = row.nextElementSibling;
                if (nextRow) {
                  const nextEditLink = nextRow.querySelector('a[href*="posting.php?mode=editpost"]') ||
                                     nextRow.querySelector('a[href*="mode=editpost"]');
                  if (nextEditLink) {
                    lastEditUrl = nextEditLink.href;
                  }
                }
              }
            });
          });
          
          return lastEditUrl;
        }, username);
        
        if (!editUrl) {
          console.log(`Could not find edit link for your post in "${thread.title}" - skipping`);
          continue;
        }
        
        console.log('Found edit link, navigating to edit page...');
        
        // Navigate to edit page
        await page.goto(editUrl, { waitUntil: 'networkidle2' });
        
        
        // Look for save/submit button on edit page
        console.log('Looking for save button...');
        let saveButton = null;
        const saveSelectors = [
          'input[name="post"]',
          'input[value*="Submit"]', 
          'input[value*="Postita"]',
          'input[value*="Salvesta"]',
          'input[type="submit"]',
          'button[type="submit"]'
        ];
        
        for (const selector of saveSelectors) {
          try {
            const buttons = await page.$$(selector);
            for (const button of buttons) {
              // Get button text/value to verify it's the submit button
              const buttonText = await page.evaluate(btn => {
                return btn.value || btn.textContent || btn.innerText || '';
              }, button);
              
              if (buttonText && (
                buttonText.toLowerCase().includes('submit') || 
                buttonText.toLowerCase().includes('post') ||
                buttonText.toLowerCase().includes('sisesta') ||
                buttonText.toLowerCase().includes('save')
              )) {
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
        console.log('Saving post...');
        await saveButton.click();
        
        // Wait for navigation or response
        try {
          await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 });
        } catch (e) {

        }

        
        console.log(`Updated post in "${thread.title}"`);                
      } catch (error) {
        console.log(`Error processing "${thread.title}": ${error.message}`);
      }
    }
    
    console.log('\nAll accessible threads have been updated!');
    
  } catch (error) {
    console.error('Bot error:', error.message);
  } finally {
    if (browser) {
      await browser.close();
    }
    rl.close();
    console.log('Browser closed');
  }
}

// Run the bot
runForumBot().catch(console.error);