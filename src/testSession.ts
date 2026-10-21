import { chromium } from 'playwright';
import { SessionManager } from './session/SessionManager.js';
import { logger } from './utils/logger.js';
import dotenv from 'dotenv';

dotenv.config();

async function testSession() {
  logger.info('[Step 1.2] Starting Facebook Session & Cookie verification test...');

  const sessionManager = new SessionManager();
  const sessionData = sessionManager.getNextSessionOptions();

  if (!sessionData) {
    logger.error('[Step 1.2 Error] No valid cookie session files found in data/sessions/ !');
    logger.info('[Tip] Please run `npm run login:manual` to log into Facebook once and save your session cookie.');
    process.exit(1);
  }

  const { options, sessionInfo } = sessionData;
  const isHeadless = process.env.HEADLESS !== 'false';

  logger.info(`[Step 1.2] Launching Playwright (Headless: ${isHeadless}) using session cookie: "${sessionInfo.fileName}" ...`);

  try {
    const browser = await chromium.launch({
      headless: isHeadless,
      args: ['--disable-blink-features=AutomationControlled'],
    });

    const context = await browser.newContext(options);
    const page = await context.newPage();

    const { isValid, reason } = await SessionManager.verifySessionValidity(page);

    if (isValid) {
      logger.info('[Step 1.2 SUCCESS] Session Valid: TRUE -> Browser accessed Facebook successfully with a valid logged-in session!');
    } else {
      logger.error(`[Step 1.2 FAILED] Session Valid: FALSE -> Reason: ${reason}`);
      sessionManager.markSessionInvalid(sessionInfo, reason || 'Unknown');
    }

    await browser.close();
    process.exit(isValid ? 0 : 1);
  } catch (error: any) {
    logger.error(`[Step 1.2 Error] Exception during session test browser run: ${error.message}`);
    process.exit(1);
  }
}

testSession();
