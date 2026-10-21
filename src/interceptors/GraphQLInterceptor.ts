import { Page, Response } from 'playwright';
import { logger } from '../utils/logger.js';
import { NormalizedPost, NormalizedComment } from '../types/facebook.js';

export class GraphQLInterceptor {
  private capturedPosts: Map<string, NormalizedPost> = new Map();
  private capturedComments: Map<string, NormalizedComment> = new Map();

  /**
   * Attach listener to Playwright Page to intercept GraphQL network responses
   */
  public attachToPage(page: Page): void {
    logger.info('[GraphQLInterceptor] Attaching Network Interceptor to monitor /api/graphql/ responses...');

    page.on('response', async (response: Response) => {
      const url = response.url();
      const method = response.request().method();

      if (method === 'POST' || url.includes('graphql') || url.includes('/api/') || url.includes('/ajax/')) {
        const status = response.status();
        if (status >= 200 && status < 300) {
          try {
            const headers = response.headers();
            const contentType = headers['content-type'] || headers['Content-Type'] || '';
            
            if (url.includes('graphql') || contentType.includes('json') || contentType.includes('text/plain') || contentType.includes('javascript')) {
              const text = await response.text();
              const cleanText = text.replace(/^for\s*\(\s*;\s*;\s*;\s*\)\s*;\s*/, '');
              const lines = cleanText.split('\n').filter((l) => l.trim().length > 0);
              
              let parsedCount = 0;
              for (const line of lines) {
                try {
                  const json = JSON.parse(line);
                  parsedCount++;
                  this.processGraphQLPayload(json);
                } catch (e) {
                  // Not valid JSON on this line
                }
              }

              if (url.includes('graphql') || parsedCount > 0) {
                logger.info(`[Network POST Intercepted] URL: ${url.split('?')[0]} (${parsedCount} JSON chunk(s) | Posts: ${this.capturedPosts.size} | Comments: ${this.capturedComments.size})`);
              }
            }
          } catch (err: any) {
            // Ignore response read timeouts
          }
        }
      }
    });
  }

  /**
   * Recursively traverses JSON payload to extract Post stories and Comments
   */
  private processGraphQLPayload(data: any): void {
    if (!data || typeof data !== 'object') return;

    this.traverseNode(data);
  }

  private traverseNode(node: any): void {
    if (!node || typeof node !== 'object') return;

    if (Array.isArray(node)) {
      for (const item of node) {
        this.traverseNode(item);
      }
      return;
    }

    // Diagnostic logging for ANY typename or comment structure when no comments captured yet
    if (this.capturedComments.size === 0) {
      if (node.__typename && !this.isPostNode(node)) {
        logger.info(`[GraphQL Typename Found] ${node.__typename} | Keys: ${Object.keys(node).join(', ')}`);
        if (node.__typename === 'Feedback') {
          for (const k of Object.keys(node)) {
            if (typeof node[k] === 'object' && node[k] !== null) {
              logger.info(`   -> Feedback sub-key "${k}": ${Object.keys(node[k]).join(', ')}`);
            }
          }
        }
      } else {
        const keys = Object.keys(node);
        const commentKeys = keys.filter(k => k.toLowerCase().includes('comment') || k.toLowerCase().includes('repl'));
        if (commentKeys.length > 0) {
          logger.info(`[GraphQL Comment Keys Found] Keys: ${commentKeys.join(', ')} | Full Keys: ${keys.slice(0, 10).join(', ')}`);
        }
      }
    }

    // Check if node is a Post / Story
    if (this.isPostNode(node)) {
      const post = this.extractPostData(node);
      if (post && post.id && !this.capturedPosts.has(post.id)) {
        this.capturedPosts.set(post.id, post);
        logger.info(`[GraphQLInterceptor] Captured Post #${post.id} by "${post.authorName}" (${post.reactionCount} likes, ${post.commentCount} comments)`);
      }
    }

    // Check if node is a Comment
    if (this.isCommentNode(node)) {
      const comment = this.extractCommentData(node);
      if (comment && comment.id && !this.capturedComments.has(comment.id)) {
        this.capturedComments.set(comment.id, comment);
        logger.info(`[GraphQLInterceptor] Captured Comment #${comment.id} by "${comment.authorName}": "${comment.text.substring(0, 40)}..."`);
      }
    }

    // Recursively check child keys
    for (const key of Object.keys(node)) {
      if (typeof node[key] === 'object' && node[key] !== null) {
        this.traverseNode(node[key]);
      }
    }
  }

  private isPostNode(node: any): boolean {
    if (!node || typeof node !== 'object') return false;
    // Look for common Facebook Comet Story identifiers
    if (node.story && typeof node.story === 'object') return true;
    if (node.comet_sections && (node.comet_sections.content || node.comet_sections.feedback || node.comet_sections.context_layout)) return true;
    if (node.post_id && (node.message || node.actor || node.actors)) return true;
    if (node.__typename === 'Story' || node.__typename === 'CometFeedStory' || node.__typename === 'FeedUnit' || node.__typename === 'Post') return true;
    if (node.id && (node.message || node.actors || node.feedback || node.reaction_count !== undefined)) return true;
    return false;
  }

  private isCommentNode(node: any): boolean {
    if (!node || typeof node !== 'object') return false;
    if (node.comment_id || (node.id && node.body && node.body.text && node.author)) return true;
    if (node.__typename === 'Comment' || node.__typename === 'CometPostComment' || node.__typename === 'XFBComment') return true;
    if (node.id && node.author && (node.body || typeof node.text === 'string')) return true;
    return false;
  }

  private extractPostData(node: any): NormalizedPost | null {
    try {
      const storyNode = node.story || node;
      const contentSection = storyNode.comet_sections?.content?.story || storyNode;
      const feedbackSection = storyNode.comet_sections?.feedback?.story?.feedback_context?.feedback_target_with_context || storyNode.feedback || storyNode.story_header?.story || {};
      
      // Extract Post ID
      let id = storyNode.id || storyNode.post_id || feedbackSection.id || node.id || '';
      if (typeof id !== 'string') id = String(id);
      if (!id || id === 'undefined' || id === '[object Object]') return null;

      // Extract Text content
      let text = '';
      if (contentSection.message?.text) {
        text = contentSection.message.text;
      } else if (storyNode.message?.text) {
        text = storyNode.message.text;
      } else if (typeof storyNode.message === 'string') {
        text = storyNode.message;
      } else if (node.message?.text) {
        text = node.message.text;
      } else if (typeof node.message === 'string') {
        text = node.message;
      }

      // Extract Author
      let authorName = 'Unknown Author';
      let authorId = '';
      const actors = contentSection.actors || storyNode.actors || storyNode.comet_sections?.context_layout?.story?.comet_sections?.actor_photo?.story?.actors || node.actors;
      if (Array.isArray(actors) && actors.length > 0) {
        authorName = actors[0].name || authorName;
        authorId = actors[0].id || '';
      } else if (storyNode.actor || node.actor) {
        const actorObj = storyNode.actor || node.actor;
        authorName = actorObj.name || authorName;
        authorId = actorObj.id || '';
      }

      // Extract Metrics
      const reactionCount = feedbackSection.reaction_count?.count || feedbackSection.reaction_count || feedbackSection.like_count || node.reaction_count || 0;
      const commentCount = feedbackSection.total_comment_count || feedbackSection.comment_count?.total_count || feedbackSection.comment_count || node.comment_count || 0;
      const shareCount = feedbackSection.share_count?.count || feedbackSection.share_count || node.share_count || 0;

      // Extract URL
      let url = storyNode.url || storyNode.permalink_url || node.url || `https://www.facebook.com/${id}`;

      return {
        id,
        url,
        authorName,
        authorId,
        text: typeof text === 'string' ? text.trim() : '',
        reactionCount: Number(reactionCount) || 0,
        commentCount: Number(commentCount) || 0,
        shareCount: Number(shareCount) || 0,
      };
    } catch (err) {
      return null;
    }
  }

  private extractCommentData(node: any): NormalizedComment | null {
    try {
      const id = String(node.id || node.comment_id || '');
      if (!id || id === 'undefined' || id === '[object Object]') return null;

      const text = node.body?.text || (typeof node.body === 'string' ? node.body : '');
      const authorName = node.author?.name || 'Unknown User';
      const authorId = node.author?.id || '';
      const reactionCount = node.feedback?.reaction_count?.count || node.feedback?.reaction_count || node.reaction_count || 0;
      const parentId = node.parent_comment?.id || node.parent_feedback?.id || node.parent_comment_id || undefined;

      return {
        id,
        authorName,
        authorId,
        text: typeof text === 'string' ? text.trim() : '',
        reactionCount: Number(reactionCount) || 0,
        parentId: parentId ? String(parentId) : undefined,
      };
    } catch (err) {
      return null;
    }
  }

  public getCapturedPosts(): NormalizedPost[] {
    return Array.from(this.capturedPosts.values());
  }

  public getCapturedComments(): NormalizedComment[] {
    return Array.from(this.capturedComments.values());
  }

  public clear(): void {
    this.capturedPosts.clear();
    this.capturedComments.clear();
  }
}
