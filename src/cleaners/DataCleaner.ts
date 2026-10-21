import { NormalizedPost, NormalizedComment } from '../types/facebook.js';
import { logger } from '../utils/logger.js';

export interface PostCleanerOptions {
  kolNames?: string[];
  removeSpam?: boolean;
  deduplicate?: boolean;
  minTextLength?: number;
}

export interface CommentCleanerOptions {
  removeShortSpam?: boolean;
  deduplicate?: boolean;
  minTextLength?: number;
}

export interface CleaningStats {
  totalInput: number;
  totalOutput: number;
  duplicatesRemoved: number;
  spamRemoved: number;
}

export class DataCleaner {
  // Regex patterns for common Facebook spam, seeding, illegal lending, SIM selling, gambling
  private static SPAM_POST_PATTERNS = [
    /sim số đẹp|bán sim|cam kết giá tốt|sim phong thủy/i,
    /vay tiền|tín dụng đen|cho vay nhanh|lãi suất thấp|giải ngân ngay/i,
    /bán quần áo|order taobao|sỉ lẻ toàn quốc|siêu sale \d+\/\d+/i,
    /xổ số|lô đề|kubet|888bet|w88|baccarat|nổ hũ|game bài đổi thưởng/i,
    /thanh lý gấp|hàng xách tay chuẩn|check uy tín|nhận kéo tài khoản/i,
  ];

  // Regex patterns for meaningless short/seeding/seeding-bot comments
  private static SPAM_COMMENT_PATTERNS = [
    /inbox|ib|check ib|check inbox|quan tâm|qtâm|xin giá|bảo nhiêu|nhiêu|ship|chấm|cham|up|\.|,|👍|❤️|😆|😂|hóng|ké|tt|tuyệt vời|hay quá|okla|hello|hi|đẹp quá|chào bạn|chúc shop|cần mua|rep ib|xem ib|ib mình|ib e/i,
  ];

  /**
   * Cleans, deduplicates, and filters out spam posts from raw crawler output
   */
  public cleanPosts(posts: NormalizedPost[], options: PostCleanerOptions = {}): {
    cleanedPosts: NormalizedPost[];
    stats: CleaningStats;
  } {
    const {
      kolNames = [],
      removeSpam = true,
      deduplicate = true,
      minTextLength = 15,
    } = options;

    logger.info(`[DataCleaner] Starting post cleaning for ${posts.length} raw posts...`);

    const stats: CleaningStats = {
      totalInput: posts.length,
      totalOutput: 0,
      duplicatesRemoved: 0,
      spamRemoved: 0,
    };

    const seenIds = new Set<string>();
    const seenTextHashes = new Set<string>();
    const cleanedPosts: NormalizedPost[] = [];

    for (const post of posts) {
      if (!post) continue;

      // 1. Deduplication Check
      if (deduplicate) {
        if (post.id && seenIds.has(post.id)) {
          stats.duplicatesRemoved++;
          continue;
        }

        // Also check normalized text hash for posts with identical content or missing ID
        const textHash = post.text.trim().toLowerCase().replace(/\s+/g, ' ');
        if (textHash && textHash.length > 20 && seenTextHashes.has(textHash)) {
          stats.duplicatesRemoved++;
          continue;
        }

        if (post.id) seenIds.add(post.id);
        if (textHash) seenTextHashes.add(textHash);
      }

      // 2. Spam / Irrelevant Content Check
      if (removeSpam) {
        // Check text length
        if (post.text.trim().length < minTextLength && post.reactionCount < 10) {
          stats.spamRemoved++;
          continue;
        }

        // Check against regex spam patterns (sim, lending, gambling, commercial spam)
        const isSpamPatternMatch = DataCleaner.SPAM_POST_PATTERNS.some((regex) =>
          regex.test(post.text) || regex.test(post.authorName)
        );

        if (isSpamPatternMatch) {
          stats.spamRemoved++;
          continue;
        }

        // If specific KOL target names are passed, ensure relevance (unless post has huge engagement)
        if (kolNames.length > 0) {
          const mentionsKol = kolNames.some((name) =>
            post.text.toLowerCase().includes(name.toLowerCase()) ||
            post.authorName.toLowerCase().includes(name.toLowerCase())
          );

          if (!mentionsKol && post.reactionCount < 50) {
            stats.spamRemoved++;
            continue;
          }
        }
      }

      cleanedPosts.push(post);
    }

    stats.totalOutput = cleanedPosts.length;
    logger.info(
      `[DataCleaner] Post cleaning completed: Input=${stats.totalInput} -> Output=${stats.totalOutput} (Removed ${stats.duplicatesRemoved} duplicates, ${stats.spamRemoved} spam posts)`
    );

    return { cleanedPosts, stats };
  }

  /**
   * Cleans, deduplicates, and filters out short/seeding spam comments from deep comment data
   */
  public cleanComments(comments: NormalizedComment[], options: CommentCleanerOptions = {}): {
    cleanedComments: NormalizedComment[];
    stats: CleaningStats;
  } {
    const {
      removeShortSpam = true,
      deduplicate = true,
      minTextLength = 3,
    } = options;

    logger.info(`[DataCleaner] Starting comment cleaning for ${comments.length} raw comments...`);

    const stats: CleaningStats = {
      totalInput: comments.length,
      totalOutput: 0,
      duplicatesRemoved: 0,
      spamRemoved: 0,
    };

    const seenIds = new Set<string>();
    const cleanedComments: NormalizedComment[] = [];

    for (const comment of comments) {
      if (!comment) continue;

      // 1. Deduplication
      if (deduplicate) {
        if (comment.id && seenIds.has(comment.id)) {
          stats.duplicatesRemoved++;
          continue;
        }
        if (comment.id) seenIds.add(comment.id);
      }

      // 2. Short / Seeding Spam Removal
      if (removeShortSpam) {
        const trimmedText = comment.text.trim();

        // Check extremely short or empty comment text
        if (trimmedText.length < minTextLength && comment.reactionCount < 5) {
          stats.spamRemoved++;
          continue;
        }

        // Check if short comment (<35 chars) matches common seeding keywords or only symbols/emojis
        const isSpamPattern = trimmedText.length < 35 && DataCleaner.SPAM_COMMENT_PATTERNS.some((regex) => regex.test(trimmedText));
        if (isSpamPattern && comment.reactionCount < 10) {
          stats.spamRemoved++;
          continue;
        }

        // Check if text is purely symbols/emojis without alphabetic characters
        const hasAlphabeticWords = /[a-zA-ZÀ-ỹ]/u.test(trimmedText);
        if (!hasAlphabeticWords && comment.reactionCount < 5) {
          stats.spamRemoved++;
          continue;
        }
      }

      cleanedComments.push(comment);
    }

    stats.totalOutput = cleanedComments.length;
    logger.info(
      `[DataCleaner] Comment cleaning completed: Input=${stats.totalInput} -> Output=${stats.totalOutput} (Removed ${stats.duplicatesRemoved} duplicates, ${stats.spamRemoved} spam comments)`
    );

    return { cleanedComments, stats };
  }
}
