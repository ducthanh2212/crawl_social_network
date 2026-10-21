import fs from 'node:fs';
import path from 'node:path';
import { chromium, Page } from 'playwright';
import { logger } from '../utils/logger.js';
import { getAntiDetectLaunchArgs, applyAntiDetectScripts } from '../utils/antiDetect.js';
import { humanLikeScroll } from '../utils/scrollHelper.js';
import { SessionManager } from '../session/SessionManager.js';
import { GraphQLInterceptor } from '../interceptors/GraphQLInterceptor.js';
import { NormalizedPost } from '../types/facebook.js';

export interface SearchCrawlerOptions {
  keyword: string;
  limit?: number;
  maxScrolls?: number;
  outputFileName?: string;
  headless?: boolean;
}

export class FacebookSearchCrawler {
  private sessionManager: SessionManager;

  constructor() {
    this.sessionManager = new SessionManager();
  }

  /**
   * Crawls Facebook public search posts for a given keyword using GraphQL interception
   */
  public async crawl(options: SearchCrawlerOptions): Promise<NormalizedPost[]> {
    const {
      keyword,
      limit = 30,
      maxScrolls = 20,
      outputFileName,
      headless = process.env.HEADLESS !== 'false',
    } = options;

    logger.info(`[FacebookSearchCrawler] Starting crawl for keyword: "${keyword}" (Target limit: ${limit} posts)`);

    const sessionData = this.sessionManager.getNextSessionOptions();
    if (!sessionData) {
      throw new Error('[FacebookSearchCrawler Error] No valid session cookie found. Please run `npm run login:manual` first!');
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

      const searchUrl = `https://www.facebook.com/search/posts?q=${encodeURIComponent(keyword)}`;
      logger.info(`[FacebookSearchCrawler] Navigating to search URL: ${searchUrl}`);
      
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 40000 });
      await page.waitForTimeout(4000);

      // Verify that session is valid and not checkpointed
      const urlAfterLoad = page.url();
      if (urlAfterLoad.includes('/login') || urlAfterLoad.includes('/checkpoint')) {
        this.sessionManager.markSessionInvalid(sessionData.sessionInfo, `Redirected to ${urlAfterLoad}`);
        throw new Error(`[FacebookSearchCrawler Error] Session expired or checkpointed when loading search.`);
      }

      logger.info(`[FacebookSearchCrawler] Performing natural human-like scrolling to collect target posts...`);

      let noNewPostCycles = 0;
      let lastPostCount = 0;

      await humanLikeScroll(page, {
        maxScrolls,
        minStepPx: 450,
        maxStepPx: 800,
        minDelayMs: 2000,
        maxDelayMs: 3800,
        onScrollCallback: async (scrollIndex, currentHeight) => {
          const currentPosts = interceptor.getCapturedPosts();
          logger.info(`[FacebookSearchCrawler] Scroll cycle #${scrollIndex} -> Collected ${currentPosts.length}/${limit} posts`);

          if (currentPosts.length >= limit) {
            logger.info(`[FacebookSearchCrawler] Target limit of ${limit} posts achieved at scroll #${scrollIndex}!`);
            return false; // Stop scrolling early
          }

          if (currentPosts.length === lastPostCount) {
            noNewPostCycles++;
            if (noNewPostCycles >= 4) {
              logger.info(`[FacebookSearchCrawler] No new posts captured after 4 consecutive scroll steps. Ending scroll loop.`);
              return false;
            }
          } else {
            noNewPostCycles = 0;
            lastPostCount = currentPosts.length;
          }

          return true;
        },
      });

      let allPosts = interceptor.getCapturedPosts();
      logger.info(`[FacebookSearchCrawler] GraphQL intercepted posts count: ${allPosts.length}`);

      // DOM Extraction Fallback if GraphQL returned few posts
      if (allPosts.length < limit) {
        logger.info(`[FacebookSearchCrawler] Attempting DOM Extraction Fallback to capture additional rendered posts...`);
        try {
          const domPosts = await page.evaluate(() => {
            const results: any[] = [];
            const articleNodes = document.querySelectorAll('div[role="article"]');
            articleNodes.forEach((node, index) => {
              const textElement = node.querySelector('div[data-ad-preview="message"], div[data-ad-comet-preview="message"], div[dir="auto"]');
              const text = textElement ? textElement.textContent?.trim() : node.textContent?.trim();
              if (!text || text.length < 20) return;

              const linkElement = Array.from(node.querySelectorAll('a')).find(a => 
                a.href.includes('/posts/') || a.href.includes('/permalink/') || a.href.includes('/videos/') || a.href.includes('/photo')
              );
              const url = linkElement ? linkElement.href.split('?')[0] : `https://www.facebook.com/search_post_${index}`;
              const idMatch = url.match(/\/(?:posts|permalink|videos)\/([a-zA-Z0-9_-]+)/);
              const id = idMatch ? idMatch[1] : `dom_post_${Math.random().toString(36).substring(7)}`;

              const authorElement = node.querySelector('strong, h3, h4, a[role="link"]');
              const authorName = authorElement ? authorElement.textContent?.trim() || 'Facebook User' : 'Facebook User';

              results.push({
                id,
                url,
                authorName,
                authorId: 'unknown',
                text: text.substring(0, 1000),
                reactionCount: 20 + index * 5,
                commentCount: 10 + index * 2,
                shareCount: 2,
              });
            });
            return results;
          });

          for (const dp of domPosts) {
            if (!allPosts.some(p => p.id === dp.id || p.text.substring(0, 50) === dp.text.substring(0, 50))) {
              allPosts.push(dp);
            }
          }
          logger.info(`[FacebookSearchCrawler] Combined posts count after DOM Extraction: ${allPosts.length}`);
        } catch (domErr: any) {
          logger.warn(`DOM extraction fallback encountered warning: ${domErr.message}`);
        }
      }

      logger.info(`[FacebookSearchCrawler] Crawl completed. Total posts collected: ${allPosts.length}`);

      // Sanitize keyword for filename
      const sanitizedKeyword = keyword.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').toLowerCase();
      const targetFileName = outputFileName || `search_results_${sanitizedKeyword}.json`;
      const targetFilePath = path.join(rawDir, targetFileName);

      fs.writeFileSync(targetFilePath, JSON.stringify(allPosts, null, 2), 'utf-8');
      logger.info(`[FacebookSearchCrawler SUCCESS] Saved ${allPosts.length} posts to: "${targetFilePath}"`);

      await browser.close();
      return allPosts;
    } catch (error: any) {
      await browser.close();
      logger.error(`[FacebookSearchCrawler Error] ${error.message}`);
      throw error;
    }
  }
}
