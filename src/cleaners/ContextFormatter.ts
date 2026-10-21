import { z } from 'zod';
import { NormalizedPost, NormalizedComment } from '../types/facebook.js';
import { logger } from '../utils/logger.js';

// Zod schema matching exact compact LLM input structure required by Step 3.2
export const LLMFormattedCommentSchema = z.object({
  author: z.string(),
  text: z.string(),
  likes: z.number(),
});

export const LLMFormattedPostSchema = z.object({
  id: z.string(),
  author: z.string(),
  date: z.string(),
  content: z.string(),
  metrics: z.object({
    likes: z.number(),
    comments: z.number(),
    shares: z.number(),
  }),
  top_controversial_comments: z.array(LLMFormattedCommentSchema),
});

export type LLMFormattedComment = z.infer<typeof LLMFormattedCommentSchema>;
export type LLMFormattedPost = z.infer<typeof LLMFormattedPostSchema>;

export interface ContextFormatterOptions {
  maxCommentsPerPost?: number;
  batchSize?: number;
}

export class ContextFormatter {
  /**
   * Formats cleaned posts and associated comments into compact, token-efficient JSON ready for LLM consumption
   */
  public formatPostsForLLM(
    posts: NormalizedPost[],
    commentsMap?: Map<string, NormalizedComment[]>,
    options: ContextFormatterOptions = {}
  ): LLMFormattedPost[] {
    const { maxCommentsPerPost = 5 } = options;

    logger.info(`[ContextFormatter] Formatting ${posts.length} cleaned posts into Zod-validated LLM Context Schema...`);

    const formattedPosts: LLMFormattedPost[] = [];

    for (const post of posts) {
      if (!post) continue;

      // Retrieve comments for this post if provided
      let comments = commentsMap?.get(post.id) || [];

      // Sort comments by controversial/risk indicators (keywords like phốt, lừa đảo, chê, giả, quảng cáo) and likes
      const riskKeywords = /phốt|lừa đảo|quảng cáo|sai sự thật|chê|kém|giả|dởm|tệ|scam|đẻo/i;
      comments = [...comments].sort((a, b) => {
        const aRisk = riskKeywords.test(a.text) ? 1000 : 0;
        const bRisk = riskKeywords.test(b.text) ? 1000 : 0;
        return (bRisk + b.reactionCount) - (aRisk + a.reactionCount);
      });

      const topControversialComments: LLMFormattedComment[] = comments
        .slice(0, maxCommentsPerPost)
        .map((c) => ({
          author: c.authorName || 'User',
          text: c.text,
          likes: c.reactionCount || 0,
        }));

      const rawDate = post.timestamp ? new Date(Number(post.timestamp) * 1000).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

      const candidatePost = {
        id: post.id || `post_${Math.random().toString(36).substring(7)}`,
        author: post.authorName || 'Unknown Author',
        date: rawDate,
        content: post.text,
        metrics: {
          likes: post.reactionCount || 0,
          comments: post.commentCount || 0,
          shares: post.shareCount || 0,
        },
        top_controversial_comments: topControversialComments,
      };

      try {
        // Validate against Zod schema
        const validatedPost = LLMFormattedPostSchema.parse(candidatePost);
        formattedPosts.push(validatedPost);
      } catch (err: any) {
        logger.warn(`[ContextFormatter] Skipped post ${post.id} due to schema validation warning: ${err.message}`);
      }
    }

    logger.info(`[ContextFormatter] Successfully formatted ${formattedPosts.length}/${posts.length} posts.`);
    return formattedPosts;
  }

  /**
   * Splits formatted posts into manageable batches (e.g., 10-15 posts per batch) to fit LLM Context Windows
   */
  public batchPosts(posts: LLMFormattedPost[], batchSize: number = 12): LLMFormattedPost[][] {
    logger.info(`[ContextFormatter] Batching ${posts.length} formatted posts into chunks of ${batchSize}...`);

    const batches: LLMFormattedPost[][] = [];
    for (let i = 0; i < posts.length; i += batchSize) {
      batches.push(posts.slice(i, i + batchSize));
    }

    logger.info(`[ContextFormatter] Created ${batches.length} context batch(es).`);
    return batches;
  }
}
