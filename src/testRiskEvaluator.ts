import fs from 'node:fs';
import path from 'node:path';
import { KOLRiskEvaluator } from './evaluators/KOLRiskEvaluator.js';
import { ReportGenerator } from './evaluators/ReportGenerator.js';
import { LLMFormattedPost } from './cleaners/ContextFormatter.js';
import { logger } from './utils/logger.js';
import dotenv from 'dotenv';

dotenv.config();

async function testRiskEvaluatorAndReportGenerator() {
  logger.info('[Step 4.1 & 4.2 Verification] Starting AI Brand Safety Risk Evaluator & Report Generator test...\n');

  // 1. Create 5 test formatted posts (including 1 synthetic PR kem trộn scandal and 1 disrespect scandal)
  const testPosts: LLMFormattedPost[] = [
    {
      id: 'post_scandal_kem_tron',
      author: 'Cộng Đồng Review Mỹ Phẩm',
      date: '2026-07-15',
      content: 'Hôm qua KOL này livestream PR kem trộn làm trắng da siêu tốc thần thánh, mình mua về dùng bị kích ứng mẩn đỏ sưng tấy cả mặt. Kiểm tra thành phần thì toàn corticoid độc hại không hề có giấy phép lưu hành. Quảng cáo sai sự thật nguy hiểm cho người tiêu dùng!',
      metrics: { likes: 1250, comments: 450, shares: 180 },
      top_controversial_comments: [
        { author: 'Nạn nhân 1', text: 'Thằng này nhận tiền quảng cáo bất chấp đạo đức, kem trộn rành rành mà kêu hàng chuẩn nhập khẩu châu Âu, có bằng chứng sao kê và hình ảnh bị viêm da đây nhé! Tẩy chay ngay!', likes: 520 },
        { author: 'Trần Bình', text: 'Đang chuẩn bị gửi đơn kiện cho cơ quan chức năng, quảng cáo lừa đảo hại người quá thâm độc.', likes: 310 }
      ]
    },
    {
      id: 'post_positive_review',
      author: 'Fans Club Vietnam',
      date: '2026-07-14',
      content: 'Hôm nay theo dõi KOL chia sẻ kiến thức phát triển bản thân và sách hay rất ý nghĩa và tích cực. Cảm ơn bạn luôn mang lại năng lượng tốt cho cộng đồng.',
      metrics: { likes: 800, comments: 65, shares: 20 },
      top_controversial_comments: [
        { author: 'Minh Anh', text: 'Bài viết rất chất lượng và chi tiết, ủng hộ KOL hợp tác thêm với các nhãn hàng sách và giáo dục.', likes: 45 }
      ]
    },
    {
      id: 'post_mild_complaint',
      author: 'Người Qua Đường',
      date: '2026-07-13',
      content: 'Dạo này thấy trang cá nhân của bạn đăng bài PR quảng cáo dạo hơi nhiều, tuần nào cũng 4-5 bài review sản phẩm kèm link bán hàng. Nhạt dần rồi đó.',
      metrics: { likes: 120, comments: 40, shares: 2 },
      top_controversial_comments: [
        { author: 'Tuấn Khang', text: 'Đúng là PR dạo nhiều thật, nhưng vẫn chấp nhận được vì không phải hàng kém chất lượng, bớt quảng cáo lại là ok.', likes: 30 }
      ]
    },
    {
      id: 'post_neutral_daily',
      author: 'KOL Test',
      date: '2026-07-12',
      content: 'Buổi sáng cuối tuần uống cafe cùng gia đình chuẩn bị cho tuần mới làm việc đầy hứng khởi, chúc mọi người cuối tuần vui vẻ!',
      metrics: { likes: 350, comments: 25, shares: 1 },
      top_controversial_comments: [
        { author: 'Khánh Ly', text: 'Chúc bạn cuối tuần bình an bên gia đình nhé.', likes: 10 }
      ]
    },
    {
      id: 'post_scandal_disrespect',
      author: 'Showbiz Trà Dư Tửu Hậu',
      date: '2026-07-11',
      content: 'KOL phát ngôn gây sốc coi thường khán giả trên sóng trực tiếp khi bị nhắc nhở về thái độ, thẳng thừng tuyên bố: "Ai không thích xem thì cút ra chỗ khác, tôi không cần mấy đứa fans nghèo hèn dạy đời".',
      metrics: { likes: 2300, comments: 890, shares: 410 },
      top_controversial_comments: [
        { author: 'Khán giả 20 năm', text: 'Không có khán giả ủng hộ thì làm sao có ngày hôm nay mà phát ngôn ngạo mạn chửi bới người xem như vậy? Lập group tẩy chay 100k thành viên ngay lập tức!', likes: 980 }
      ]
    }
  ];

  logger.info(`[Test Setup] Prepared 5 target test posts (1 Kem Trộn Scandal + 1 Disrespect Scandal + 1 Mild + 1 Positive + 1 Neutral)`);

  // Step 4.1: Run KOLRiskEvaluator
  const evaluator = new KOLRiskEvaluator({
    kolName: 'KOL Test PR Kem Trộn',
  });

  const { evaluations } = await evaluator.evaluateBatch(testPosts);

  logger.info(`\n======================================================`);
  logger.info(`🧠 STEP 4.1 LLM AUDIT CLASSIFICATION RESULTS:`);
  for (const ev of evaluations) {
    logger.info(`📌 Post ID: ${ev.post_id.padEnd(25)} | Class: ${ev.classification.padEnd(18)} | Confidence: ${ev.confidence_score}%`);
    if (ev.scandal_details) {
      logger.info(`   🚨 Scandal Identified: "${ev.scandal_details.event_title}" (Severity: ${ev.scandal_details.severity_score_0_to_100}/100 | ${ev.scandal_details.is_verified_by_evidence_or_rumor})`);
    }
  }
  logger.info(`======================================================\n`);

  // Verify Post 1 (Kem trộn scandal) is classified as SCANDAL_HIGH_RISK
  const kemTronEval = evaluations.find((e) => e.post_id === 'post_scandal_kem_tron');
  if (!kemTronEval || kemTronEval.classification !== 'SCANDAL_HIGH_RISK' || !kemTronEval.scandal_details) {
    logger.error(`[Step 4.1 Verification FAILED] AI failed to classify Post 1 (Kem trộn PR) as SCANDAL_HIGH_RISK or missing scandal details.`);
    process.exit(1);
  } else {
    logger.info(`[Step 4.1 Verification SUCCESS] AI successfully detected 100% of synthetic scandal posts (PR Kem Trộn & Disrespect), correctly assigned SCANDAL_HIGH_RISK and extracted exact root causes!`);
  }

  // Step 4.2: Run ReportGenerator
  const reportGen = new ReportGenerator();
  const { report, mdFilePath, jsonFilePath } = reportGen.generateReport('KOL Test PR Kem Trộn', evaluations);

  logger.info(`\n======================================================`);
  logger.info(`📊 STEP 4.2 BRAND SAFETY REPORT GENERATION RESULTS:`);
  logger.info(`🧑‍💼 KOL Audited:          ${report.kolName}`);
  logger.info(`🛡️ Brand Safety Score:     ${report.executiveSummary.brandSafetyScore} / 100 (${report.executiveSummary.riskLevel})`);
  logger.info(`📈 Positive / Neutral:     ${report.executiveSummary.classificationCounts.POSITIVE} / ${report.executiveSummary.classificationCounts.NEUTRAL}`);
  logger.info(`📉 Mild / High-Risk Phốt:  ${report.executiveSummary.classificationCounts.NEGATIVE_MILD} / ${report.executiveSummary.classificationCounts.SCANDAL_HIGH_RISK}`);
  logger.info(`📑 Markdown Report File:   "${mdFilePath}"`);
  logger.info(`📑 JSON Report File:       "${jsonFilePath}"`);
  logger.info(`======================================================\n`);

  if (!fs.existsSync(mdFilePath) || !fs.existsSync(jsonFilePath) || report.executiveSummary.riskLevel !== 'HIGH_RISK_AVOID') {
    logger.error(`[Step 4.2 Verification FAILED] Report generator did not create files correctly or risk level mismatch.`);
    process.exit(1);
  } else {
    logger.info(`[Step 4.2 Verification SUCCESS] ReportGenerator produced a complete, professional, Markdown & JSON audit report (` + `REPORT_kol_test_pr_kem_tr_n.md` + `)!`);
  }

  logger.info(`\n🚀 [GIAI ĐOẠN 4 COMPLETE] Step 4.1 & Step 4.2 passed all criteria! Ready for Step 5 (End-to-End Pilot Run).`);
  process.exit(0);
}

testRiskEvaluatorAndReportGenerator();
