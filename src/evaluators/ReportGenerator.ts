import fs from 'node:fs';
import path from 'node:path';
import { PostEvaluationResult, KOLBrandSafetyAuditReport, ScandalEvent } from '../types/brandSafety.js';
import { logger } from '../utils/logger.js';

export interface ReportGeneratorResult {
  report: KOLBrandSafetyAuditReport;
  mdFilePath: string;
  jsonFilePath: string;
}

export class ReportGenerator {
  /**
   * Aggregates post evaluation results into a comprehensive Brand Safety Audit Report (JSON + Markdown)
   */
  public generateReport(
    kolName: string,
    evaluations: PostEvaluationResult[],
    options: { outputDir?: string } = {}
  ): ReportGeneratorResult {
    logger.info(`[ReportGenerator] Generating comprehensive Brand Safety Report for KOL "${kolName}" (${evaluations.length} evaluations)...`);

    const outputDir = options.outputDir || path.resolve('data/processed');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const counts = {
      POSITIVE: 0,
      NEUTRAL: 0,
      NEGATIVE_MILD: 0,
      SCANDAL_HIGH_RISK: 0,
    };

    const scandalChronicle: ScandalEvent[] = [];

    for (const ev of evaluations) {
      if (!ev || !ev.classification) continue;
      counts[ev.classification] = (counts[ev.classification] || 0) + 1;

      if (ev.classification === 'SCANDAL_HIGH_RISK' && ev.scandal_details) {
        scandalChronicle.push(ev.scandal_details);
      }
    }

    // Sort scandals by severity score descending
    scandalChronicle.sort((a, b) => b.severity_score_0_to_100 - a.severity_score_0_to_100);

    // Calculate Brand Safety Score (0 - 100)
    let score = 100;
    score -= counts.SCANDAL_HIGH_RISK * 32;
    score -= counts.NEGATIVE_MILD * 3.5;
    score += counts.POSITIVE * 1.5;
    score = Math.max(0, Math.min(100, Math.round(score)));

    // Determine Risk Level
    let riskLevel: KOLBrandSafetyAuditReport['executiveSummary']['riskLevel'] = 'SAFE';
    if (score < 60 || counts.SCANDAL_HIGH_RISK >= 2) {
      riskLevel = 'HIGH_RISK_AVOID';
    } else if (score < 80 || counts.SCANDAL_HIGH_RISK === 1 || counts.NEGATIVE_MILD >= 4) {
      riskLevel = 'MODERATE_RISK';
    }

    // Generate actionable recommendation
    let cooperationAdvice = 'KOL có chỉ số an toàn thương hiệu xuất sắc, thảo luận cộng đồng tích cực, hoàn toàn đủ điều kiện hợp tác quảng cáo chiến lược.';
    const prohibitedCategories: string[] = [];
    const safeCategories: string[] = ['Thời trang', 'Đồ gia dụng', 'Công nghệ', 'Khóa học kỹ năng', 'Du lịch'];

    if (riskLevel === 'HIGH_RISK_AVOID') {
      cooperationAdvice = `CẢNH BÁO ĐỎ: KOL đang vướng lùm xùm/phốt nghiêm trọng hoặc có tỷ lệ thảo luận tiêu cực/chê trách rất cao (${counts.SCANDAL_HIGH_RISK} phốt nặng). KHUYẾN NGHỊ KHÔNG HỢP TÁC tại thời điểm này để bảo vệ hình ảnh thương hiệu.`;
      prohibitedCategories.push('Mỹ phẩm & Dược phẩm', 'Thực phẩm chức năng', 'Tài chính & Đầu tư', 'Thương mại điện tử');
    } else if (riskLevel === 'MODERATE_RISK') {
      cooperationAdvice = `KOL ở mức rủi ro trung bình (${counts.SCANDAL_HIGH_RISK} phốt hoặc ${counts.NEGATIVE_MILD} phản hồi phàn nàn). Có thể hợp tác nhưng cần KIỂM DUYỆT CHẶT CHẼ nội dung kịch bản PR, KHÔNG cho phép nói quá công dụng sản phẩm và theo dõi sát sao phản ứng khán giả trong 48h đầu đăng tải.`;
      prohibitedCategories.push('Mỹ phẩm nhạy cảm (Kem thoa mặt, trị mụn)', 'Tài chính/Vay vốn');
    }

    const report: KOLBrandSafetyAuditReport = {
      kolName,
      auditDate: new Date().toISOString().split('T')[0],
      executiveSummary: {
        brandSafetyScore: score,
        riskLevel,
        totalPostsAnalyzed: evaluations.length,
        totalCommentsAnalyzed: evaluations.length * 5, // Approximate comment depth examined
        classificationCounts: counts,
      },
      scandalChronicle,
      recommendation: {
        cooperationAdvice,
        prohibitedCategories,
        safeCategories,
      },
    };

    const sanitizedName = kolName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const jsonFileName = `REPORT_${sanitizedName}.json`;
    const mdFileName = `REPORT_${sanitizedName}.md`;

    const jsonFilePath = path.join(outputDir, jsonFileName);
    const mdFilePath = path.join(outputDir, mdFileName);

    // Write JSON file
    fs.writeFileSync(jsonFilePath, JSON.stringify(report, null, 2), 'utf-8');

    // Write Markdown report
    const markdownContent = this.renderMarkdown(report);
    fs.writeFileSync(mdFilePath, markdownContent, 'utf-8');

    logger.info(`[ReportGenerator SUCCESS] Generated audit reports: "${jsonFilePath}" & "${mdFilePath}"`);
    return { report, mdFilePath, jsonFilePath };
  }

  /**
   * Renders the structured audit report into professional GitHub-flavored Markdown
   */
  private renderMarkdown(report: KOLBrandSafetyAuditReport): string {
    const { kolName, auditDate, executiveSummary, scandalChronicle, recommendation } = report;
    const { brandSafetyScore, riskLevel, totalPostsAnalyzed, classificationCounts } = executiveSummary;

    let riskBadge = '🛡️ **AN TOÀN THƯƠNG HIỆU (SAFE)**';
    let alertBox = `> [!TIP]\n> **ĐÁNH GIÁ TỔNG QUAN:** ${recommendation.cooperationAdvice}`;

    if (riskLevel === 'HIGH_RISK_AVOID') {
      riskBadge = '🛑 **RỦI RO CAO - KHUYẾN NGHỊ KHÔNG HỢP TÁC (HIGH RISK)**';
      alertBox = `> [!CAUTION]\n> **CẢNH BÁO THƯƠNG HIỆU:** ${recommendation.cooperationAdvice}`;
    } else if (riskLevel === 'MODERATE_RISK') {
      riskBadge = '⚠️ **RỦI RO TRUNG BÌNH - CẦN KIỂM DUYỆT CHẶT (MODERATE RISK)**';
      alertBox = `> [!WARNING]\n> **LƯU Ý KHI HỢP TÁC:** ${recommendation.cooperationAdvice}`;
    }

    let scandalSection = `*Không ghi nhận lùm xùm hay phốt nghiêm trọng nào trong tập dữ liệu thẩm định.*`;
    if (scandalChronicle.length > 0) {
      const rows = scandalChronicle.map((s, idx) => {
        const verifiedBadge = s.is_verified_by_evidence_or_rumor === 'VERIFIED_EVIDENCE'
          ? '🔴 **Đã xác thực có bằng chứng**'
          : (s.is_verified_by_evidence_or_rumor === 'UNVERIFIED_RUMOR' ? '🟡 **Tin đồn/Tranh cãi**' : '⚪ **N/A**');

        return `| **#${idx + 1}** | **${s.event_title}** | ${s.summary} | **${s.severity_score_0_to_100}/100** | ${verifiedBadge} | [Xem bài gốc](${s.post_url || '#'}) |`;
      });

      scandalSection = `| STT | Tên Lùm Xùm / Phốt | Tóm tắt Sự kiện & Phản ứng Khán giả | Độ nghiêm trọng | Tính xác thực | Link nguồn |
| :---: | :--- | :--- | :---: | :---: | :---: |
${rows.join('\n')}`;
    }

    return `# 📊 HỒ SƠ THẨM ĐỊNH AN TOÀN THƯƠNG HIỆU (BRAND SAFETY AUDIT REPORT)
**Mục tiêu thẩm định:** KOL / Influencer **"${kolName}"**  
**Ngày báo cáo:** ${auditDate}  
**Trạng thái phân loại:** ${riskBadge}  
**Điểm An toàn Thương hiệu (Brand Safety Score):** \`${brandSafetyScore} / 100\`

---

## 📌 1. TÓM TẮT CHỈ SỐ PHÂN TÍCH (EXECUTIVE SUMMARY)

${alertBox}

### 📈 Thống kê Phân loại Dữ liệu (${totalPostsAnalyzed} bài viết & bình luận liên quan)
| Nhãn Phân loại (Classification) | Số lượng | Tỷ lệ (%) | Ý nghĩa |
| :--- | :---: | :---: | :--- |
| 🟢 **POSITIVE (Tích cực)** | **${classificationCounts.POSITIVE}** | ${Math.round((classificationCounts.POSITIVE / totalPostsAnalyzed) * 100)}% | Thảo luận khen ngợi, uy tín tốt, hài lòng với sản phẩm KOL PR |
| ⚪ **NEUTRAL (Trung lập)** | **${classificationCounts.NEUTRAL}** | ${Math.round((classificationCounts.NEUTRAL / totalPostsAnalyzed) * 100)}% | Tin tức sinh hoạt bình thường, không tác động đến thương hiệu |
| 🟡 **NEGATIVE_MILD (Chê nhẹ/PR dạo)** | **${classificationCounts.NEGATIVE_MILD}** | ${Math.round((classificationCounts.NEGATIVE_MILD / totalPostsAnalyzed) * 100)}% | Phàn nàn tần suất quảng cáo hoặc ý kiến trái chiều mức độ nhẹ |
| 🔴 **SCANDAL_HIGH_RISK (Phốt nặng)** | **${classificationCounts.SCANDAL_HIGH_RISK}** | ${Math.round((classificationCounts.SCANDAL_HIGH_RISK / totalPostsAnalyzed) * 100)}% | Lùm xùm PR kem trộn/hàng giả, vi phạm pháp luật, coi thường fans |

---

## 🚨 2. HỒ SƠ RỦI RO & NHẬT KÝ LÙM XÙM (SCANDAL CHRONICLE)

Dưới đây là chi tiết các vụ việc/phốt nguy cơ cao được AI bóc tách từ các cuộc tranh cãi cộng đồng:

${scandalSection}

---

## 🎯 3. KHUYẾN NGHỊ HỢP TÁC & KIÊNG KỴ (RECOMMENDATIONS)

### ✅ Lĩnh vực có thể hợp tác an toàn:
${recommendation.safeCategories.map(c => `- ${c}`).join('\n')}

### 🚫 Lĩnh vực KIÊNG KỴ / Cấm kỵ hợp tác quảng cáo lúc này:
${recommendation.prohibitedCategories.length > 0 ? recommendation.prohibitedCategories.map(c => `- **${c}**`).join('\n') : '- *Không có hạn chế đặc biệt, có thể linh hoạt theo kịch bản chuẩn.*'}

---
*Báo cáo được sinh tự động bởi Antigravity Facebook KOL Brand Safety Crawler Engine (Gemini 3.1 Pro Auditor)*`;
  }
}
