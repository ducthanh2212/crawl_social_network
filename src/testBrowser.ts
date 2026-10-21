import { chromium } from 'playwright';
import { logger } from './utils/logger.js';
import dotenv from 'dotenv';

dotenv.config();

async function testBrowser() {
  logger.info('[Step 1.1] Starting Playwright Chromium browser verification test...');
  const isHeadless = process.env.HEADLESS !== 'false';

  try {
    const browser = await chromium.launch({
      headless: isHeadless,
      args: ['--disable-blink-features=AutomationControlled'],
    });

    logger.info(`[Step 1.1] Browser launched successfully (Headless: ${isHeadless})`);

    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    });

    const page = await context.newPage();
    logger.info('[Step 1.1] Navigating to https://example.com to verify connection...');
    await page.goto('https://example.com', { waitUntil: 'domcontentloaded', timeout: 30000 });

    const title = await page.title();
    logger.info(`[Step 1.1] Page title retrieved: "${title}"`);

    await browser.close();
    logger.info('[Step 1.1] Browser closed safely. Step 1.1 verification completed successfully!');
    process.exit(0);
  } catch (error: any) {
    logger.error(`[Step 1.1 Error] Browser launch failed: ${error.message}`);
    process.exit(1);
  }
}

testBrowser();
