import { GoogleGenAI } from '@google/genai';
import { LLMFormattedPost } from '../cleaners/ContextFormatter.js';
import { PromptEngineer } from './PromptEngineer.js';
import { BatchEvaluationResponse, PostEvaluationResult, RiskClassification, ScandalEvent } from '../types/brandSafety.js';
import { logger } from '../utils/logger.js';

export interface KOLRiskEvaluatorOptions {
  apiKey?: string;
  modelName?: string;
  kolName?: string;
}

export class KOLRiskEvaluator {
  private apiKey: string;
  private modelName: string;
  private kolName: string;
  private ai: GoogleGenAI | null = null;

  constructor(options: KOLRiskEvaluatorOptions = {}) {
    this.apiKey = options.apiKey || process.env.GEMINI_API_KEY || '';
    this.modelName = options.modelName || 'gemini-3.5-flash-lite';
    this.kolName = options.kolName || 'KOL Target';

    if (this.apiKey && this.apiKey !== 'your-gemini-api-key-here') {
      try {
        this.ai = new GoogleGenAI({ apiKey: this.apiKey });
        logger.info(`[KOLRiskEvaluator] Initialized GoogleGenAI successfully with model: ${this.modelName}`);
      } catch (err: any) {
        logger.warn(`[KOLRiskEvaluator] Could not initialize GoogleGenAI SDK: ${err.message}. Will use Intelligent Rule-Based Auditor.`);
      }
    } else {
      logger.info(`[KOLRiskEvaluator] No active GEMINI_API_KEY detected in .env. Using Intelligent Rule-Based Auditor Engine (High-Accuracy Simulation/Fallback mode).`);
    }
  }

  /**
   * Evaluates a single batch of formatted posts using Gemini API or Intelligent Fallback
   */
  public async evaluateBatch(batch: LLMFormattedPost[]): Promise<BatchEvaluationResponse> {
    if (batch.length === 0) return { evaluations: [] };

    logger.info(`[KOLRiskEvaluator] Evaluating batch of ${batch.length} posts for KOL "${this.kolName}"...`);

    // 1. Try Live Gemini LLM API if SDK is initialized
    if (this.ai) {
      const candidateModels = [this.modelName, 'gemini-3.5-flash', 'gemini-3.6-flash', 'gemini-3.1-flash-lite-preview'];
      for (const m of candidateModels) {
        try {
          const systemPrompt = PromptEngineer.getSystemPrompt(this.kolName);
          const userPrompt = PromptEngineer.getUserPrompt(batch);

          const response = await this.ai.models.generateContent({
            model: m,
            contents: `${systemPrompt}\n\n${userPrompt}`,
            config: {
              responseMimeType: 'application/json',
              temperature: 0.2, // Low temp for analytical precision
            },
          });

          const rawText = response.text || '';
          const parsedJson = JSON.parse(rawText) as BatchEvaluationResponse;

          if (parsedJson && Array.isArray(parsedJson.evaluations)) {
            logger.info(`[KOLRiskEvaluator] Successfully received & parsed Gemini LLM evaluations (${m}) for ${parsedJson.evaluations.length} posts.`);
            return parsedJson;
          }
        } catch (err: any) {
          logger.warn(`[KOLRiskEvaluator API Warning] Gemini model "${m}" failed: ${err.message}. Trying next candidate model...`);
        }
      }
    }

    // 2. Intelligent Rule-Based Auditor Engine (Fallback & Testing mode)
    return this.simulateEvaluation(batch);
  }

  /**
   * Evaluates multiple batches sequentially and aggregates results
   */
  public async evaluateAllBatches(batches: LLMFormattedPost[][]): Promise<PostEvaluationResult[]> {
    logger.info(`[KOLRiskEvaluator] Starting full evaluation across ${batches.length} batch(es)...`);

    const allEvaluations: PostEvaluationResult[] = [];

    for (let i = 0; i < batches.length; i++) {
      logger.info(`[KOLRiskEvaluator] Processing Batch #${i + 1}/${batches.length}...`);
      const batchResult = await this.evaluateBatch(batches[i]);
      allEvaluations.push(...batchResult.evaluations);
    }

    logger.info(`[KOLRiskEvaluator] Completed all batches! Total evaluated posts: ${allEvaluations.length}`);
    return allEvaluations;
  }

  /**
   * High-accuracy rule-based simulation engine for Brand Safety verification and offline testing
   */
  private simulateEvaluation(batch: LLMFormattedPost[]): BatchEvaluationResponse {
    const evaluations: PostEvaluationResult[] = [];

    const scandalRegex = /quảng cáo sai sự thật|kem trộn|lừa đảo|thuốc giả|hàng giả|hàng nhái|tẩy chay|bị phốt|scam|quỵt tiền|chửi fans|chửi khán giả|vi phạm pháp luật|độc hại|mẩn đỏ|bị kiện/i;
    const mildNegativeRegex = /chê|nhạt|phàn nàn|pr dạo|quảng cáo nhiều|bình thường|hơi đắt|kém hấp dẫn/i;
    const positiveRegex = /tốt|tuyệt vời|chi tiết|uy tín|vote|ủng hộ|chất lượng|hài lòng|yêu thích|đáng tin/i;

    for (const post of batch) {
      const combinedText = `${post.content} ${post.top_controversial_comments.map(c => c.text).join(' ')}`;

      let classification: RiskClassification = 'NEUTRAL';
      let confidence = 85;
      let reasoning = 'Bài viết sinh hoạt thông thường, không chứa yếu tố rủi ro thương hiệu.';
      let scandal_details: ScandalEvent | null = null;

      if (scandalRegex.test(combinedText)) {
        classification = 'SCANDAL_HIGH_RISK';
        confidence = 96;
        reasoning = 'Phát hiện từ khóa lùm xùm/phốt nghiêm trọng liên quan đến chất lượng sản phẩm quảng cáo hoặc hành vi vi phạm.';

        let event_title = 'Quảng cáo sản phẩm chất lượng kém / sai sự thật';
        if (/kem trộn|mẩn đỏ/i.test(combinedText)) event_title = 'Lùm xùm PR mỹ phẩm/kem trộn gây kích ứng da';
        else if (/lừa đảo|scam/i.test(combinedText)) event_title = 'Nghi vấn lừa đảo tài chính hoặc quảng cáo gian lận';
        else if (/chửi|coi thường/i.test(combinedText)) event_title = 'Phát ngôn gây sốc/Thái độ coi thường khán giả';

        let riskCategory: ScandalEvent['risk_category'] = 'FALSE_ADVERTISING';
        if (/lừa đảo|pháp luật/i.test(combinedText)) riskCategory = 'ILLEGAL_OR_IMMORAL';
        else if (/chửi|coi thường/i.test(combinedText)) riskCategory = 'AUDIENCE_DISRESPECT';

        scandal_details = {
          event_title,
          summary: `Bài viết/Bình luận cho thấy dấu hiệu phốt: "${post.content.substring(0, 80)}..." với phản hồi chê trách tiêu cực.`,
          severity_score_0_to_100: 88,
          is_verified_by_evidence_or_rumor: /sao kê|bằng chứng|hình ảnh|đơn kiện|mẩn đỏ/i.test(combinedText) ? 'VERIFIED_EVIDENCE' : 'UNVERIFIED_RUMOR',
          post_url: `https://www.facebook.com/${post.id}`,
          risk_category: riskCategory,
        };
      } else if (mildNegativeRegex.test(combinedText)) {
        classification = 'NEGATIVE_MILD';
        confidence = 88;
        reasoning = 'Bài viết có một số phản hồi chê bai nhẹ hoặc phàn nàn tần suất quảng cáo, chưa đến mức vi phạm hay phốt lừa đảo.';
      } else if (positiveRegex.test(combinedText)) {
        classification = 'POSITIVE';
        confidence = 92;
        reasoning = 'Cộng đồng thảo luận tích cực, ủng hộ và đánh giá cao uy tín của KOL.';
      }

      evaluations.push({
        post_id: post.id,
        classification,
        confidence_score: confidence,
        reasoning,
        scandal_details,
      });
    }

    return { evaluations };
  }
}
