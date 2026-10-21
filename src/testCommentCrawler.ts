import { FacebookCommentCrawler } from './crawlers/FacebookCommentCrawler.js';
import { logger } from './utils/logger.js';
import dotenv from 'dotenv';

dotenv.config();

async function testCommentCrawler() {
  logger.info('[Step 2.3] Starting Facebook Deep Comment Crawler verification test...');

  const args = process.argv.slice(2);
  const urlArg = args.find((a) => a.startsWith('--postUrl='));
  const limitArg = args.find((a) => a.startsWith('--maxComments='));

  // Default to a public post or Mark Zuckerberg's profile timeline post if none provided
  const postUrl = urlArg ? urlArg.split('=')[1] : 'https://www.facebook.com/zuck';
  const maxComments = limitArg ? parseInt(limitArg.split('=')[1], 10) || 50 : 50;

  logger.info(`[Step 2.3 Options] Post URL: "${postUrl}", Target Max Comments: ${maxComments}`);

  const crawler = new FacebookCommentCrawler();

  try {
    const result = await crawler.crawl({
      postUrl,
      maxComments,
      maxScrolls: 20,
    });

    logger.info(`\n======================================================`);
    logger.info(`💬 DEEP COMMENT CRAWL SUMMARY:`);
    logger.info(`📰 Post Retrieved: ${result.post ? `"${result.post.text.substring(0, 50)}..." by ${result.post.authorName}` : 'No top-level post node parsed'}`);
    logger.info(`💬 Total Comments & Replies Collected: ${result.comments.length}`);
    logger.info(`======================================================\n`);

    if (result.comments.length > 0) {
      logger.info(`[Sample Crawled Comment #1]:`);
      console.log(JSON.stringify(result.comments[0], null, 2));

      if (result.comments.length > 1) {
        logger.info(`[Sample Crawled Comment #2]:`);
        console.log(JSON.stringify(result.comments[1], null, 2));
      }
    } else {
      logger.warn(`[Step 2.3 Warning] No comments were retrieved for URL "${postUrl}". Check if post has visible comments.`);
    }

    process.exit(result.comments.length > 0 ? 0 : 1);
  } catch (err: any) {
    logger.error(`[Step 2.3 Error] Exception during comment crawl execution: ${err.message}`);
    process.exit(1);
  }
}

testCommentCrawler();
