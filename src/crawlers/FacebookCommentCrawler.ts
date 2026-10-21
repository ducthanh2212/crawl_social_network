import fs from 'node:fs';
import path from 'node:path';
import { chromium, Page } from 'playwright';
import { logger } from '../utils/logger.js';
import { getAntiDetectLaunchArgs, applyAntiDetectScripts } from '../utils/antiDetect.js';
import { humanLikeScroll } from '../utils/scrollHelper.js';
import { SessionManager } from '../session/SessionManager.js';
import { GraphQLInterceptor } from '../interceptors/GraphQLInterceptor.js';
import { NormalizedPost, NormalizedComment } from '../types/facebook.js';

export interface CommentCrawlerOptions {
  postUrl: string;
  maxComments?: number;
  maxScrolls?: number;
  outputFileName?: string;
  headless?: boolean;
}

export interface CommentCrawlerResult {
  post: NormalizedPost | null;
  comments: NormalizedComment[];
}

export class FacebookCommentCrawler {
  private sessionManager: SessionManager;

  constructor() {
    this.sessionManager = new SessionManager();
  }

  /**
   * Crawls deep top-level comments and nested replies of a specific Facebook post
   */
  public async crawl(options: CommentCrawlerOptions): Promise<CommentCrawlerResult> {
    const {
      postUrl,
      maxComments = 100,
      maxScrolls = 20,
      outputFileName,
      headless = process.env.HEADLESS !== 'false',
    } = options;

    logger.info(`[FacebookCommentCrawler] Starting deep comment crawl for URL: "${postUrl}" (Target: ${maxComments} comments)`);

    const sessionData = this.sessionManager.getNextSessionOptions();
    if (!sessionData) {
      throw new Error('[FacebookCommentCrawler Error] No valid session cookie found. Please run `npm run login:manual` first!');
    }

    const rawDir = path.resolve('data/raw');
    if (!fs.existsSync(rawDir)) {
      fs.mkdirSync(rawDir, { recursive: true });
    }

    const launchArgs = getAntiDetectLaunchArgs();
    const browser = await chromium.launch({
      headless,
      args: launchArgs,
    });

    try {
      const context = await browser.newContext(sessionData.options);
      await applyAntiDetectScripts(context);

      const page = await context.newPage();
      const interceptor = new GraphQLInterceptor();
      interceptor.attachToPage(page);

      logger.info(`[FacebookCommentCrawler] Navigating to post URL: ${postUrl}`);
      await page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(6000);

      // Verify valid session
      const urlAfterLoad = page.url();
      if (urlAfterLoad.includes('/login') || urlAfterLoad.includes('/checkpoint')) {
        this.sessionManager.markSessionInvalid(sessionData.sessionInfo, `Redirected to ${urlAfterLoad}`);
        throw new Error(`[FacebookCommentCrawler Error] Session expired or checkpointed when loading post.`);
      }

      // Try to switch comment filter to "All comments" ("Tất cả bình luận")
      await this.trySwitchToAllComments(page);

      logger.info(`[FacebookCommentCrawler] Performing natural scrolling & expanding hidden comments/replies...`);

      let noNewCommentCycles = 0;
      let lastCommentCount = 0;

      await humanLikeScroll(page, {
        maxScrolls,
        minStepPx: 350,
        maxStepPx: 650,
        minDelayMs: 2200,
        maxDelayMs: 3800,
        onScrollCallback: async (scrollIndex, currentHeight) => {
          // While scrolling, check and click "View more comments" / "View replies" buttons to expand nested GraphQL queries
          await this.tryClickExpandButtons(page);

          const currentComments = interceptor.getCapturedComments();
          logger.info(`[FacebookCommentCrawler] Scroll cycle #${scrollIndex} -> Collected ${currentComments.length}/${maxComments} comments`);

          if (currentComments.length >= maxComments) {
            logger.info(`[FacebookCommentCrawler] Target limit of ${maxComments} comments achieved at scroll #${scrollIndex}!`);
            return false;
          }

          if (currentComments.length === lastCommentCount) {
            noNewCommentCycles++;
            if (noNewCommentCycles >= 6) {
              logger.info(`[FacebookCommentCrawler] No new comments captured after 6 consecutive scroll/expand steps. Ending loop.`);
              return false;
            }
          } else {
            noNewCommentCycles = 0;
            lastCommentCount = currentComments.length;
          }

          return true;
        },
      });

      const allPosts = interceptor.getCapturedPosts();
      const allComments = interceptor.getCapturedComments();

      logger.info(`[FacebookCommentCrawler] Crawl completed. Total posts retrieved: ${allPosts.length}, Total comments retrieved: ${allComments.length}`);

      const result: CommentCrawlerResult = {
        post: allPosts.length > 0 ? allPosts[0] : null,
        comments: allComments,
      };

      // Extract postId for output filename
      const postIdMatch = postUrl.match(/(\d{10,})/);
      const postId = postIdMatch ? postIdMatch[1] : 'post_detail';
      const targetFileName = outputFileName || `comments_${postId}.json`;
      const targetFilePath = path.join(rawDir, targetFileName);

      fs.writeFileSync(targetFilePath, JSON.stringify(result, null, 2), 'utf-8');
      logger.info(`[FacebookCommentCrawler SUCCESS] Saved deep comment data (${allComments.length} comments) to: "${targetFilePath}"`);

      await browser.close();
      return result;
    } catch (error: any) {
      await browser.close();
      logger.error(`[FacebookCommentCrawler Error] ${error.message}`);
      throw error;
    }
  }

  /**
   * Attempts to switch the comment dropdown filter from "Most relevant" to "All comments"
   */
  private async trySwitchToAllComments(page: Page): Promise<void> {
    try {
      logger.info(`[FacebookCommentCrawler] Checking for comment filter dropdown (Switching to "All comments")...`);
      
      // Look for dropdown triggers matching "Most relevant" or "Phù hợp nhất" or "Bình luận phù hợp nhất"
      const filterTriggers = await page.$$('span:has-text("Phù hợp nhất"), span:has-text("Most relevant"), span:has-text("Bình luận hàng đầu")');
      if (filterTriggers.length > 0) {
        for (const trigger of filterTriggers) {
          try {
            if (await trigger.isVisible()) {
              await trigger.click({ timeout: 2000 });
              await page.waitForTimeout(1500);

              // Click option "Tất cả bình luận" or "All comments"
              const allOption = await page.$('span:has-text("Tất cả bình luận"), span:has-text("All comments")');
              if (allOption && await allOption.isVisible()) {
                await allOption.click({ timeout: 2000 });
                logger.info(`[FacebookCommentCrawler] Switched comment filter to "All comments" ("Tất cả bình luận")`);
                await page.waitForTimeout(2500);
                return;
              }
            }
          } catch (e) {
            // Ignore click error on obscured element
          }
        }
      }
    } catch (err) {
      logger.warn(`[FacebookCommentCrawler] Could not switch filter dropdown (Using default comment stream).`);
    }
  }

  /**
   * Finds and clicks "View more comments", "View previous comments", or "View X replies" buttons in DOM
   */
  private async tryClickExpandButtons(page: Page): Promise<void> {
    try {
      const expandSelectors = [
        'span:has-text("Xem thêm bình luận")',
        'span:has-text("View more comments")',
        'span:has-text("Xem phản hồi")',
        'span:has-text("View replies")',
        'span:has-text("Hiển thị bình luận trước đó")',
        'span:has-text("View previous comments")',
        'span:has-text("Xem thêm 1 bình luận")',
        'div[role="button"]:has-text("bình luận")',
        'div[role="button"]:has-text("replies")'
      ];

      for (const selector of expandSelectors) {
        const elements = await page.$$(selector);
        for (const el of elements.slice(0, 3)) { // Click at most top 3 visible buttons per scroll step
          try {
            if (await el.isVisible()) {
              await el.click({ timeout: 1200 });
              await page.waitForTimeout(800);
            }
          } catch (e) {
            // Button might have scrolled out or detached
          }
        }
      }
    } catch (err) {
      // Ignore non-blocking DOM search exceptions
    }
  }
}
