import fs from 'node:fs';
import path from 'node:path';
import { Page, BrowserContextOptions } from 'playwright';
import { logger } from '../utils/logger.js';

export interface SessionInfo {
  filePath: string;
  fileName: string;
  isValid: boolean;
  lastTested?: Date;
}

export class SessionManager {
  private sessionsDir: string;
  private sessions: SessionInfo[] = [];
  private currentSessionIndex: number = 0;

  constructor(sessionsDir: string = path.resolve('data/sessions')) {
    this.sessionsDir = sessionsDir;
    this.ensureSessionsDir();
    this.reloadSessions();
  }

  private ensureSessionsDir() {
    if (!fs.existsSync(this.sessionsDir)) {
      fs.mkdirSync(this.sessionsDir, { recursive: true });
    }
  }

  /**
   * Scan data/sessions directory for all .json cookie session files
   */
  public reloadSessions(): void {
    if (!fs.existsSync(this.sessionsDir)) return;

    const files = fs.readdirSync(this.sessionsDir);
    const jsonFiles = files.filter(
      (f) => f.endsWith('.json') && f !== 'storageState.example.json'
    );

    this.sessions = jsonFiles.map((file) => ({
      filePath: path.join(this.sessionsDir, file),
      fileName: file,
      isValid: true,
    }));

    logger.info(`[SessionManager] Found ${this.sessions.length} session file(s) in ${this.sessionsDir}`);
  }

  /**
   * Get ContextOptions containing storageState for Playwright
   */
  public getNextSessionOptions(): { options: BrowserContextOptions; sessionInfo: SessionInfo } | null {
    const validSessions = this.sessions.filter((s) => s.isValid);
    if (validSessions.length === 0) {
      logger.warn('[SessionManager Warning] No valid session cookie files remaining in data/sessions/');
      return null;
    }

    if (this.currentSessionIndex >= validSessions.length) {
      this.currentSessionIndex = 0;
    }

    const selectedSession = validSessions[this.currentSessionIndex];
    this.currentSessionIndex = (this.currentSessionIndex + 1) % validSessions.length;

    logger.info(`[SessionManager] Using session cookie: "${selectedSession.fileName}"`);

    return {
      options: {
        storageState: selectedSession.filePath,
        viewport: { width: 1280, height: 720 },
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      },
      sessionInfo: selectedSession,
    };
  }

  /**
   * Mark a session as invalid (e.g. Checkpoint triggered or expired) so it won't be reused during loops
   */
  public markSessionInvalid(sessionInfo: SessionInfo, reason: string): void {
    logger.warn(`[SessionManager Warning] Marking session "${sessionInfo.fileName}" as INVALID. Reason: ${reason}`);
    sessionInfo.isValid = false;
  }

  /**
   * Verify directly inside Playwright whether the Facebook session cookie is active (logged in) or checkpointed/logged out
   */
  public static async verifySessionValidity(page: Page, navigate: boolean = true): Promise<{ isValid: boolean; reason?: string }> {
    if (navigate) {
      logger.info('[SessionManager] Checking Facebook login session status...');
    }
    try {
      if (navigate) {
        await page.goto('https://www.facebook.com/', {
          waitUntil: 'domcontentloaded',
          timeout: 30000,
        });
        // Short 3s wait for Facebook redirect scripts if session expired
        await page.waitForTimeout(3000);
      }

      const currentUrl = page.url();
      if (navigate) {
        logger.info(`[SessionManager] Current URL after accessing Facebook: ${currentUrl}`);
      }

      // Check if redirected to login screen or recovery
      if (currentUrl.includes('/login') || currentUrl.includes('/recover/initiate') || currentUrl.includes('login.php')) {
        return { isValid: false, reason: 'Redirected to Login screen (Cookie expired or not logged in)' };
      }

      // Check if redirected to checkpoint / verification challenge
      if (currentUrl.includes('/checkpoint/') || currentUrl.includes('/challenge/')) {
        return { isValid: false, reason: 'Account is locked by Facebook Checkpoint verification' };
      }

      // Check DOM for email/password inputs (indicates not logged in)
      const loginEmailInput = await page.$('input[name="email"]');
      const loginPassInput = await page.$('input[name="pass"]');
      if (loginEmailInput && loginPassInput) {
        return { isValid: false, reason: 'Detected email/password login form on page' };
      }

      // Check for logged-in indicators (navigation bar, search bar, main feed, profile button)
      const isLoggedIn = await page.evaluate(() => {
        const nav = document.querySelector('div[role="navigation"]');
        const searchInput = document.querySelector('input[type="search"]');
        const feed = document.querySelector('div[role="main"]');
        const accountBtn = document.querySelector('div[aria-label*="Trang cá nhân"], div[aria-label*="Your profile"], div[aria-label*="Account"], svg[aria-label*="Tài khoản"]');
        
        return !!(nav || searchInput || feed || accountBtn);
      });

      if (isLoggedIn) {
        if (navigate) {
          logger.info('[SessionManager SUCCESS] Cookie is working perfectly! Logged into Facebook.');
        }
        return { isValid: true };
      } else {
        const title = await page.title();
        if (title.toLowerCase().includes('đăng nhập') || title.toLowerCase().includes('log in')) {
          return { isValid: false, reason: `Page title indicates login: "${title}"` };
        }
        if (!navigate) {
          // When waiting during manual login (navigate=false), if feed/nav is missing then not valid yet
          return { isValid: false, reason: 'Facebook Feed/Navigation elements not detected yet' };
        }
        logger.info('[SessionManager] No login form or checkpoint detected. Assuming valid session.');
        return { isValid: true };
      }
    } catch (error: any) {
      logger.error(`[SessionManager Error] Exception during session verification: ${error.message}`);
      return { isValid: false, reason: `Network or timeout error: ${error.message}` };
    }
  }
}
