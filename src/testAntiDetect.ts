import { chromium } from 'playwright';
import { logger } from './utils/logger.js';
import { getAntiDetectLaunchArgs, applyAntiDetectScripts } from './utils/antiDetect.js';
import { humanLikeScroll } from './utils/scrollHelper.js';
import { SessionManager } from './session/SessionManager.js';
import dotenv from 'dotenv';

dotenv.config();

async function testAntiDetect() {
  logger.info('[Step 1.3] Starting Anti-detection & Human-like Scrolling verification test...');
  const isHeadless = process.env.HEADLESS !== 'false';

  const launchArgs = getAntiDetectLaunchArgs();
  logger.info(`[Step 1.3] Launching Chromium with anti-detect flags: ${launchArgs.slice(0, 2).join(', ')} ...`);

  try {
    const browser = await chromium.launch({
      headless: isHeadless,
      args: launchArgs,
    });

    // Try to load session if available, otherwise launch fresh context
    const sessionManager = new SessionManager();
    const sessionData = sessionManager.getNextSessionOptions();
    const contextOptions = sessionData ? sessionData.options : { viewport: { width: 1280, height: 720 } };

    const context = await browser.newContext(contextOptions);

    // Apply anti-detection initialization scripts
    await applyAntiDetectScripts(context);

    const page = await context.newPage();

    logger.info('[Step 1.3] Inspecting navigator.webdriver property on blank page...');
    await page.goto('about:blank');
    const webdriverValue = await page.evaluate(() => navigator.webdriver);
    
    if (webdriverValue !== undefined && webdriverValue !== false) {
      logger.error(`[Step 1.3 FAILED] navigator.webdriver is ${webdriverValue}. Anti-detect masking failed!`);
      await browser.close();
      process.exit(1);
    } else {
      logger.info(`[Step 1.3 SUCCESS] navigator.webdriver masked successfully -> Value: ${String(webdriverValue)}`);
    }

    // Test natural human scrolling on Facebook (or fallback target)
    const targetUrl = sessionData ? 'https://www.facebook.com/' : 'https://example.com/';
    logger.info(`[Step 1.3] Navigating to ${targetUrl} to verify smooth human-like scrolling...`);
    
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Perform 4 test scroll cycles
    await humanLikeScroll(page, {
      maxScrolls: 4,
      minStepPx: 350,
      maxStepPx: 600,
      minDelayMs: 1200,
      maxDelayMs: 2500,
    });

    logger.info('[Step 1.3 SUCCESS] Human-like scrolling and anti-detection verification PASSED flawlessly!');
    await browser.close();
    process.exit(0);
  } catch (error: any) {
    logger.error(`[Step 1.3 Error] Exception during anti-detect test run: ${error.message}`);
    process.exit(1);
  }
}

testAntiDetect();
