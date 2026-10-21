import { chromium } from 'playwright';
import { logger } from './utils/logger.js';
import { getAntiDetectLaunchArgs, applyAntiDetectScripts } from './utils/antiDetect.js';
import { humanLikeScroll } from './utils/scrollHelper.js';
import { SessionManager } from './session/SessionManager.js';
import { GraphQLInterceptor } from './interceptors/GraphQLInterceptor.js';
import dotenv from 'dotenv';

dotenv.config();

async function testInterceptor() {
  logger.info('[Step 2.1] Starting Facebook GraphQL Network Interceptor test...');

  // Parse custom target URL from CLI arguments if provided (e.g. --url="https://www.facebook.com/...")
  const args = process.argv.slice(2);
  const urlArg = args.find((a) => a.startsWith('--url='));
  const targetUrl = urlArg ? urlArg.split('=')[1] : 'https://www.facebook.com/zuck';

  logger.info(`[Step 2.1] Target URL to intercept: "${targetUrl}"`);

  const sessionManager = new SessionManager();
  const sessionData = sessionManager.getNextSessionOptions();

  if (!sessionData) {
    logger.error('[Step 2.1 Error] No valid cookie session found. Please run `npm run login:manual` first!');
    process.exit(1);
  }

  const isHeadless = process.env.HEADLESS !== 'false';
  const launchArgs = getAntiDetectLaunchArgs();

  try {
    const browser = await chromium.launch({
      headless: isHeadless,
      args: launchArgs,
    });

    const context = await browser.newContext(sessionData.options);
    await applyAntiDetectScripts(context);

    const page = await context.newPage();

    // Initialize and attach our GraphQL Interceptor before navigating
    const interceptor = new GraphQLInterceptor();
    interceptor.attachToPage(page);

    logger.info(`[Step 2.1] Navigating to ${targetUrl} and listening for network GraphQL JSON streams...`);
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });

    // Wait and perform human scrolling to trigger GraphQL dynamic pagination feeds
    await page.waitForTimeout(5000);
    await humanLikeScroll(page, {
      maxScrolls: 8,
      minStepPx: 500,
      maxStepPx: 850,
      minDelayMs: 2200,
      maxDelayMs: 3800,
    });

    // Retrieve captured normalized items
    const posts = interceptor.getCapturedPosts();
    const comments = interceptor.getCapturedComments();

    logger.info(`\n======================================================`);
    logger.info(`✨ GRAPHQL INTERCEPTION RESULTS FOR "${targetUrl}":`);
    logger.info(`📊 Total Posts Captured via GraphQL: ${posts.length}`);
    logger.info(`💬 Total Comments Captured via GraphQL: ${comments.length}`);
    logger.info(`======================================================\n`);

    if (posts.length > 0) {
      logger.info(`[Sample Intercepted Post #1]:`);
      console.log(JSON.stringify(posts[0], null, 2));
    }

    if (comments.length > 0) {
      logger.info(`[Sample Intercepted Comment #1]:`);
      console.log(JSON.stringify(comments[0], null, 2));
    }

    await browser.close();

    if (posts.length === 0 && comments.length === 0) {
      logger.warn('[Step 2.1 Warning] No posts or comments were parsed from GraphQL. Check target URL or scroll duration.');
      process.exit(1);
    } else {
      logger.info('[Step 2.1 SUCCESS] GraphQL Interception engine successfully extracted structured data directly from network packets without HTML DOM querying!');
      process.exit(0);
    }
  } catch (error: any) {
    logger.error(`[Step 2.1 Error] Exception during interceptor test: ${error.message}`);
    process.exit(1);
  }
}

testInterceptor();
