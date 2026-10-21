import fs from 'node:fs';
import path from 'node:path';
import { DataCleaner } from './cleaners/DataCleaner.js';
import { ContextFormatter, LLMFormattedPostSchema } from './cleaners/ContextFormatter.js';
import { NormalizedPost, NormalizedComment } from './types/facebook.js';
import { logger } from './utils/logger.js';

async function testDataCleaningAndFormatting() {
  logger.info('[Step 3.1 & 3.2 Verification] Starting Data Cleaning, Deduplication & LLM Context Formatting test...\n');

  // 1. Generate 100 test raw posts (80 genuine KOL discussions + 20 synthetic spam & duplicates)
  const rawPosts: NormalizedPost[] = [];

  // Add 80 genuine discussions
  for (let i = 1; i <= 80; i++) {
    rawPosts.push({
      id: `post_genuine_${i}`,
      url: `https://www.facebook.com/kol_test/posts/${1000 + i}`,
      authorName: `Community User #${i}`,
      text: `Hôm nay mình thấy KOL này review sản phẩm mỹ phẩm khá chi tiết, nhưng một số bạn bảo dùng bị kích ứng da. Bài viết thảo luận số ${i} về chất lượng và uy tín.`,
      reactionCount: 25 + (i % 50),
      commentCount: 10 + (i % 20),
      shareCount: 5 + (i % 10),
      timestamp: Math.floor(Date.now() / 1000) - i * 3600,
    });
  }

  // Add 10 exact duplicate posts (same ID as genuine post 1 to 10)
  for (let i = 1; i <= 10; i++) {
    rawPosts.push({
      id: `post_genuine_${i}`,
      url: `https://www.facebook.com/kol_test/posts/${1000 + i}`,
      authorName: `Community User #${i}`,
      text: `Hôm nay mình thấy KOL này review sản phẩm mỹ phẩm khá chi tiết, nhưng một số bạn bảo dùng bị kích ứng da. Bài viết thảo luận số ${i} về chất lượng và uy tín.`,
      reactionCount: 25 + (i % 50),
      commentCount: 10 + (i % 20),
      shareCount: 5 + (i % 10),
    });
  }

  // Add 5 SIM selling spam posts
  for (let i = 1; i <= 5; i++) {
    rawPosts.push({
      id: `post_spam_sim_${i}`,
      url: `https://www.facebook.com/spam_sim/posts/${2000 + i}`,
      authorName: `Sim Số Đẹp VIP ${i}`,
      text: `BÁN SIM SỐ ĐẸP CAM KẾT GIÁ TỐT NHẤT THỊ TRƯỜNG 0988.888.${i}xx liên hệ ngay!`,
      reactionCount: 1,
      commentCount: 0,
      shareCount: 0,
    });
  }

  // Add 3 illegal lending spam posts
  for (let i = 1; i <= 3; i++) {
    rawPosts.push({
      id: `post_spam_lending_${i}`,
      url: `https://www.facebook.com/lending/posts/${3000 + i}`,
      authorName: `Cho Vay Nhanh ${i}`,
      text: `Hỗ trợ VAY TIỀN NHANH tín dụng đen giải ngân ngay trong ngày chỉ cần CMND không cần thẩm định thủ tục siêu nhanh!`,
      reactionCount: 0,
      commentCount: 0,
      shareCount: 0,
    });
  }

  // Add 2 gambling spam posts
  for (let i = 1; i <= 2; i++) {
    rawPosts.push({
      id: `post_spam_gambling_${i}`,
      url: `https://www.facebook.com/gambling/posts/${4000 + i}`,
      authorName: `Kubet Casino ${i}`,
      text: `KUBET nổ hũ đổi thưởng cực lớn siêu sale khuyến mãi tặng 100k cho thành viên mới đăng ký tham gia ngay hôm nay!`,
      reactionCount: 2,
      commentCount: 1,
      shareCount: 0,
    });
  }

  logger.info(`[Test Setup] Created total ${rawPosts.length} raw input posts (80 Genuine + 10 Duplicates + 10 Spam)`);

  // Step 3.1: Run DataCleaner on posts
  const cleaner = new DataCleaner();
  const { cleanedPosts, stats: postStats } = cleaner.cleanPosts(rawPosts);

  logger.info(`\n======================================================`);
  logger.info(`📋 STEP 3.1 POST CLEANING RESULTS:`);
  logger.info(`📥 Total Input Posts:       ${postStats.totalInput}`);
  logger.info(`♻️ Duplicates Removed:      ${postStats.duplicatesRemoved}`);
  logger.info(`🚫 Spam/Seeding Removed:    ${postStats.spamRemoved}`);
  logger.info(`📤 Cleaned Output Posts:    ${postStats.totalOutput}`);
  logger.info(`======================================================\n`);

  if (postStats.totalOutput !== 80 || postStats.duplicatesRemoved + postStats.spamRemoved !== 20) {
    logger.error(`[Step 3.1 Verification FAILED] Expected exactly 80 output posts and 20 removed (10 dups, 10 spam). Got ${postStats.totalOutput} output, ${postStats.duplicatesRemoved + postStats.spamRemoved} removed.`);
    process.exit(1);
  } else {
    logger.info(`[Step 3.1 Verification SUCCESS] DataCleaner accurately purged 100% of synthetic spam and duplicates while preserving all 80 genuine discussions!`);
  }

  // Also verify comment cleaning
  const rawComments: NormalizedComment[] = [
    { id: 'c1', authorName: 'User 1', text: 'Thằng này quảng cáo sai sự thật, kem thoa lên bị mẩn đỏ cực kỳ nguy hiểm, tẩy chay!', reactionCount: 15 },
    { id: 'c2', authorName: 'Bot Seeding 1', text: 'inbox e với ạ', reactionCount: 0 },
    { id: 'c3', authorName: 'Bot Seeding 2', text: 'check ib shop ơi', reactionCount: 1 },
    { id: 'c4', authorName: 'User 2', text: '.', reactionCount: 0 },
    { id: 'c5', authorName: 'User 3', text: 'mình dùng thấy tốt lắm nha, vote 5 sao cho shop', reactionCount: 8 },
  ];

  const { cleanedComments, stats: commentStats } = cleaner.cleanComments(rawComments);
  logger.info(`💬 Comment Cleaning Test: Input=${commentStats.totalInput} -> Output=${commentStats.totalOutput} (Removed ${commentStats.spamRemoved} short seeding comments)`);

  // Step 3.2: Run ContextFormatter & Batching
  const formatter = new ContextFormatter();
  const commentsMap = new Map<string, NormalizedComment[]>();
  commentsMap.set('post_genuine_1', cleanedComments);

  const formattedPosts = formatter.formatPostsForLLM(cleanedPosts, commentsMap);
  const batches = formatter.batchPosts(formattedPosts, 12);

  // Validate every item against Zod Schema explicitly
  let zodPassed = true;
  for (const p of formattedPosts) {
    const res = LLMFormattedPostSchema.safeParse(p);
    if (!res.success) {
      zodPassed = false;
      logger.error(`[Zod Validation Error] Post ID ${p.id} failed schema verification: ${JSON.stringify(res.error.issues)}`);
    }
  }

  if (!zodPassed) {
    logger.error(`[Step 3.2 Verification FAILED] One or more posts failed Zod schema validation.`);
    process.exit(1);
  }

  // Save to clean_posts.json
  const cleanedDir = path.resolve('data/cleaned');
  if (!fs.existsSync(cleanedDir)) {
    fs.mkdirSync(cleanedDir, { recursive: true });
  }

  const targetPath = path.join(cleanedDir, 'clean_posts.json');
  fs.writeFileSync(targetPath, JSON.stringify(formattedPosts, null, 2), 'utf-8');

  logger.info(`\n======================================================`);
  logger.info(`📁 STEP 3.2 CONTEXT FORMATTING & BATCHING RESULTS:`);
  logger.info(`💎 Total Formatted Posts:   ${formattedPosts.length} (100% Zod Schema Verified)`);
  logger.info(`📦 Total LLM Batches:       ${batches.length} batches (~12 posts/batch)`);
  logger.info(`💾 Output Saved To:         "${targetPath}"`);
  logger.info(`======================================================\n`);

  logger.info(`[Step 3.2 Sample Formatted Post with Top Controversial Comments]:`);
  console.log(JSON.stringify(formattedPosts[0], null, 2));

  logger.info(`\n🚀 [GIAI ĐOẠN 3 COMPLETE] Step 3.1 & Step 3.2 passed all criteria! Ready for Step 4 (AI Risk Analyzer).`);
  process.exit(0);
}

testDataCleaningAndFormatting();
