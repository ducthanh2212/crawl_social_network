import { Page } from 'playwright';
import { logger } from './logger.js';

export interface HumanScrollOptions {
  maxScrolls?: number;
  minStepPx?: number;
  maxStepPx?: number;
  minDelayMs?: number;
  maxDelayMs?: number;
  onScrollCallback?: (scrollIndex: number, currentHeight: number) => Promise<boolean | void>;
}

/**
 * Returns a random integer between min and max (inclusive)
 */
export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Pauses execution for a randomized duration to simulate human reaction jitter
 */
export async function jitterDelay(minMs: number = 1800, maxMs: number = 4200): Promise<void> {
  const delay = randomInt(minMs, maxMs);
  await new Promise((resolve) => setTimeout(resolve, delay));
}

/**
 * Simulates human-like scrolling behavior with variable acceleration, random step sizes, and jitter delays
 */
export async function humanLikeScroll(page: Page, options: HumanScrollOptions = {}): Promise<void> {
  const {
    maxScrolls = 15,
    minStepPx = 300,
    maxStepPx = 750,
    minDelayMs = 2000,
    maxDelayMs = 4500,
    onScrollCallback,
  } = options;

  logger.info(`[HumanScroll] Starting natural scrolling cycle (Max scrolls: ${maxScrolls}, Step: ${minStepPx}-${maxStepPx}px)`);

  let previousHeight = 0;
  let noChangeCount = 0;

  for (let i = 1; i <= maxScrolls; i++) {
    const stepPx = randomInt(minStepPx, maxStepPx);

    // Execute smooth scrolling inside browser page context
    await page.evaluate((step) => {
      window.scrollBy({
        top: step,
        behavior: 'smooth',
      });
    }, stepPx);

    // Random human jitter pause after each scroll action
    const pauseMs = randomInt(minDelayMs, maxDelayMs);
    logger.info(`[HumanScroll] Scroll step #${i}/${maxScrolls} (${stepPx}px down) -> Sleeping ${pauseMs}ms...`);
    await new Promise((resolve) => setTimeout(resolve, pauseMs));

    // Check current scroll height to detect if reached the bottom of feed
    const currentHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    
    if (onScrollCallback) {
      const continueScrolling = await onScrollCallback(i, currentHeight);
      if (continueScrolling === false) {
        logger.info(`[HumanScroll] Scroll stopped early by onScrollCallback at step #${i}`);
        break;
      }
    }

    if (currentHeight === previousHeight) {
      noChangeCount++;
      if (noChangeCount >= 3) {
        logger.info('[HumanScroll] Reached bottom of page or no new dynamic content loaded after 3 attempts.');
        break;
      }
    } else {
      noChangeCount = 0;
      previousHeight = currentHeight;
    }
  }

  logger.info('[HumanScroll] Natural scrolling cycle completed successfully.');
}
