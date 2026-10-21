import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { logger } from '../utils/logger.js';
import { SessionManager } from './SessionManager.js';

async function saveLoginSession() {
  logger.info('[Manual Login] Starting Interactive Facebook Login Mode to save session cookie...');
  logger.info('[Manual Login] Chrome window will launch shortly...');

  const sessionsDir = path.resolve('data/sessions');
  if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(sessionsDir, { recursive: true });
  }

  const targetPath = path.join(sessionsDir, 'storageState.json');

  const browser = await chromium.launch({
    headless: false, // Headful mode required for manual user login
    args: ['--disable-blink-features=AutomationControlled', '--start-maximized'],
  });

  const context = await browser.newContext({
    viewport: null,
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();

  logger.info('[Manual Login] Navigating to https://www.facebook.com ...');
  await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded' });

  logger.info('[Manual Login] Please complete your Facebook login inside the opened Chrome window.');
  logger.info('[Manual Login] If you are already logged in or once login is finished, wait 5-10 seconds for automatic detection!');

  // Loop waiting up to 3 minutes (180s) for manual login completion
  const maxWaitSeconds = 180;
  let loggedIn = false;

  for (let i = 0; i < maxWaitSeconds; i += 3) {
    await page.waitForTimeout(3000);
    const { isValid } = await SessionManager.verifySessionValidity(page, false);
    if (isValid) {
      loggedIn = true;
      break;
    }
    if (i % 15 === 0 && i > 0) {
      logger.info(`[Manual Login] Waiting for login completion... (${i}/${maxWaitSeconds} seconds elapsed)`);
    }
  }

  if (!loggedIn) {
    logger.error('[Manual Login Error] Timeout (3 minutes elapsed). Login not detected. Closing browser.');
    await browser.close();
    process.exit(1);
  }

  logger.info('[Manual Login] Saving all Cookies and LocalStorage session data to storageState.json ...');
  await context.storageState({ path: targetPath });

  logger.info(`[Manual Login SUCCESS] Session successfully saved to: "${targetPath}"`);
  logger.info('[Manual Login] You can now run `npm run test:session` to verify Step 1.2!');

  await browser.close();
  process.exit(0);
}

saveLoginSession().catch((err) => {
  logger.error(`[Manual Login Error] ${err.message}`);
  process.exit(1);
});
