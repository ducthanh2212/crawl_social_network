import { FacebookSearchCrawler } from './crawlers/FacebookSearchCrawler.js';
import { logger } from './utils/logger.js';
import dotenv from 'dotenv';

dotenv.config();

async function testSearchCrawler() {
  logger.info('[Step 2.2] Starting Facebook Search Crawler verification test...');

  // Parse CLI flags like --keyword="KOL_TEST phốt" and --limit=30
  const args = process.argv.slice(2);
  const keywordArg = args.find((a) => a.startsWith('--keyword='));
  const limitArg = args.find((a) => a.startsWith('--limit='));

  const keyword = keywordArg ? keywordArg.split('=')[1] : 'Mark Zuckerberg';
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) || 30 : 30;

  logger.info(`[Step 2.2 Options] Keyword: "${keyword}", Limit: ${limit}`);

  const crawler = new FacebookSearchCrawler();

  try {
    const posts = await crawler.crawl({
      keyword,
      limit,
      maxScrolls: 25,
    });

    logger.info(`\n======================================================`);
    logger.info(`🔍 SEARCH CRAWL SUMMARY FOR "${keyword}":`);
    logger.info(`📈 Total Posts Collected & Saved: ${posts.length}`);
    logger.info(`======================================================\n`);

    if (posts.length > 0) {
      logger.info(`[Sample Crawled Post #1]:`);
      console.log(JSON.stringify(posts[0], null, 2));
    } else {
      logger.warn(`[Step 2.2 Warning] No posts were retrieved for keyword "${keyword}". Please check if keyword returns results on public FB.`);
    }

    process.exit(posts.length > 0 ? 0 : 1);
  } catch (err: any) {
    logger.error(`[Step 2.2 Error] Exception during search crawl execution: ${err.message}`);
    process.exit(1);
  }
}

testSearchCrawler();
