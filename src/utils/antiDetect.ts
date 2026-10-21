import { BrowserContext, Page } from 'playwright';
import { logger } from './logger.js';

/**
 * Returns standard Chromium launch arguments to bypass anti-bot mechanisms
 */
export function getAntiDetectLaunchArgs(): string[] {
  return [
    '--disable-blink-features=AutomationControlled',
    '--disable-infobars',
    '--no-default-browser-check',
    '--no-first-run',
    '--disable-notifications',
    '--disable-popup-blocking',
  ];
}

/**
 * Injects JavaScript initialization scripts into the Page or Context to mask automated browser fingerprints
 */
export async function applyAntiDetectScripts(target: Page | BrowserContext): Promise<void> {
  logger.info('[AntiDetect] Injecting stealth scripts to mask navigator.webdriver and browser fingerprints...');

  const script = `
    // Overwrite the 'webdriver' property to return undefined
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });

    // Mock window.chrome if not present
    if (!window.chrome) {
      window.chrome = { runtime: {} };
    }

    // Ensure navigator.languages and plugins match realistic human browser profiles
    Object.defineProperty(navigator, 'languages', {
      get: () => ['vi-VN', 'vi', 'en-US', 'en'],
    });

    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3], // non-empty array
    });
  `;

  if ('addInitScript' in target) {
    await target.addInitScript(script);
  }
}
