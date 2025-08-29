const puppeteer = require('puppeteer');
const readline = require('readline');

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

// Function to get password input (hidden)
function getPasswordInput(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    
    let password = '';
    process.stdin.on('data', function(ch) {
      ch = ch + '';
      
      switch(ch) {
        case '\n':
        case '\r':
        case '\u0004':
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdout.write('\n');
          resolve(password);
          break;
        case '\u0003':
          process.exit();
          break;
        case '\u007f': // backspace
          if (password.length > 0) {
            password = password.slice(0, -1);
            process.stdout.write('\b \b');
          }
          break;
        default:
          password += ch;
          process.stdout.write('*');
          break;
      }
    });
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
      headless: true, // Set to true if you don't want to see the browser
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
    
    // Find all posts made by the user
    console.log('Finding your posts...');
    const userPosts = await page.evaluate((username) => {
      const posts = [];
      const rows = document.querySelectorAll('table tr');
      
      rows.forEach((row, index) => {
        // Look for posts by checking if the username appears in the row
        const userCell = row.querySelector('td:nth-child(5)'); 
        const titleCell = row.querySelector('td:nth-child(3) a');
        
        if (userCell && titleCell && userCell.textContent.trim().includes(username)) {
          posts.push({
            title: titleCell.textContent.trim(),
            link: titleCell.href,
            rowIndex: index
          });
        }
      });
      
      return posts;
    }, username);
    
    if (userPosts.length === 0) {
      console.log('No posts found by your username');
      return;
    }
    
    console.log(`Found ${userPosts.length} posts by ${username}`);
    
    // Process each post
    for (let i = 0; i < userPosts.length; i++) {
      const post = userPosts[i];
      console.log(`\nProcessing post ${i + 1}/${userPosts.length}: "${post.title}"`);
      
      try {
        // Navigate to the post
        await page.goto(post.link, { waitUntil: 'networkidle2' });

        
        // Look for edit button - try multiple possible selectors
        let editButton = null;
        const editSelectors = [
          'img[alt="muuda/kustuta postitus"]',
          'a[href*="https://foorum.hinnavaatlus.ee/posting.php?mode=editpost&p="]',
          'img[src*="icon_edit.gif"]',
          'a img[alt*="muuda" i]'
        ];
        
        for (const selector of editSelectors) {
          try {
            await page.waitForSelector(selector, { timeout: 3000 });
            editButton = await page.$(selector);
            if (editButton) break;
          } catch (e) {
            // Try next selector
          }
        }
        
        if (!editButton) {
          console.log(`Edit button not found for "${post.title}" - skipping`);
          continue;
        }
        
        // Click edit button
        console.log('Clicking edit...');
        await editButton.click();
        await page.waitForNavigation({ waitUntil: 'networkidle2' });
        
        // Look for save button
        let saveButton = null;
        const specificSelector = 'body > table > tbody > tr > td > table.forumline > tbody > tr:nth-child(43) > td > input:nth-child(6)'
        
        try {
          await page.waitForSelector(specificSelector, { timeout: 5000});
          saveButton = await page.$(specificSelector);
        } catch (e) {
          console.log(`Save button not found for "${post.title}" - skipping`);
        }
        
        if (!saveButton) {
          console.log(`Save button not found for "${post.title}" - skipping`);
          continue;
        }
        
        // Click save button
        console.log('Saving post...');
        await saveButton.click();
        await page.waitForNavigation({ waitUntil: 'networkidle2' });
        
        console.log(`Updated "${post.title}"`);
        
        
      } catch (error) {
        console.log(`Error processing "${post.title}": ${error.message}`);
      }
    }
    
    console.log('\nBot finished! All accessible posts have been updated.');
    
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