import { GoogleGenAI } from '@google/genai';
import { logger } from '../utils/logger.js';

export interface KeywordGeneratorOptions {
  kolName: string;
  domain?: string;
  maxKeywords?: number;
}

export class KeywordGenerator {
  private ai: GoogleGenAI | null = null;
  private hasApiKey: boolean = false;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey && apiKey.trim() !== '' && apiKey !== 'your_api_key_here') {
      this.ai = new GoogleGenAI({ apiKey });
      this.hasApiKey = true;
    }
  }

  /**
   * Automatically generates high-precision brand safety audit keywords
   * for a specific KOL and domain using LLM or smart domain heuristics.
   */
  public async generateKeywords(options: KeywordGeneratorOptions): Promise<string[]> {
    const { kolName, domain = 'Tổng hợp / Đa ngành', maxKeywords = 8 } = options;

    logger.info(`[KeywordGenerator] Generating targeted Brand Safety keywords for "${kolName}" (Domain: ${domain})...`);

    if (this.hasApiKey && this.ai) {
      const candidateModels = ['gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.6-flash', 'gemini-3.1-flash-lite-preview'];
      for (const model of candidateModels) {
        try {
          const prompt = `Bạn là một chuyên gia Thẩm định Rủi ro Thương hiệu (Brand Safety Auditor) và Chuyên gia Phân tích Dữ liệu Mạng xã hội.
Mục tiêu: Hãy tạo ra danh sách từ ${maxKeywords} đến ${maxKeywords + 4} từ khóa (keyword) hoặc cụm từ ngắn bằng tiếng Việt thường được cộng đồng mạng dùng khi thảo luận, đánh giá, hoặc "bóc phốt" về KOL/Influencer có tên: "${kolName}" trong lĩnh vực: "${domain}".

Các từ khóa cần tập trung vào:
1. Các lùm xùm, phốt đạo đức, thái độ, phát ngôn gây tranh cãi nói chung (ví dụ: phốt, lừa đảo, drama, tẩy chay).
2. Các rủi ro đặc thù nguy hiểm nhất của riêng ngành "${domain}" (ví dụ nếu ngành mỹ phẩm: kem trộn, kích ứng, corticoid, quảng cáo sai sự thật; nếu tài chính: lùa gà, úp sô, đa cấp; nếu ẩm thực: mất vệ sinh, ngộ độc, chê quán đòi tiền...).
3. Các đánh giá chất lượng nói chung (ví dụ: review, có tốt không, chê).

Trả về CHÍNH XÁC dưới dạng một mảng JSON thuần túy gồm các chuỗi (string), không kèm giải thích hay định dạng markdown khác.
Ví dụ: ["phốt", "lừa đảo", "quảng cáo sai sự thật", "review"]`;

          const response = await this.ai.models.generateContent({
            model,
            contents: prompt,
          });

          const text = response.text || '';
          const jsonMatch = text.match(/\[\s*(?:"[^"]+"\s*,?\s*)+\]/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (Array.isArray(parsed) && parsed.length > 0) {
              logger.info(`✅ [KeywordGenerator LLM (${model})] Generated ${parsed.length} keywords via AI successfully.`);
              return parsed.slice(0, maxKeywords);
            }
          }
        } catch (err: any) {
          logger.warn(`[KeywordGenerator Warning] Model ${model} unavailable (${err.message.split('\n')[0]}). Trying next model...`);
        }
      }
      logger.info(`Switching to intelligent domain heuristic fallback after LLM attempts.`);
    } else {
      logger.info(`[KeywordGenerator] No active GEMINI_API_KEY detected. Using intelligent domain heuristic knowledge base.`);
    }

    return this.generateDomainHeuristicKeywords(kolName, domain, maxKeywords);
  }

  private generateDomainHeuristicKeywords(kolName: string, domain: string, maxKeywords: number): string[] {
    const dLower = domain.toLowerCase();

    // Universal core safety keywords
    const universal = ['phốt', 'review', 'lừa đảo', 'drama', 'quảng cáo'];

    let domainSpecific: string[] = [];

    if (dLower.includes('mỹ phẩm') || dLower.includes('beauty') || dLower.includes('lam dep') || dLower.includes('da') || dLower.includes('skincare')) {
      domainSpecific = ['kem trộn', 'kích ứng da', 'corticoid', 'hàng giả', 'quảng cáo sai sự thật', 'tẩy chay'];
    } else if (dLower.includes('tài chính') || dLower.includes('crypto') || dLower.includes('đầu tư') || dLower.includes('chứng khoán') || dLower.includes('khóa học')) {
      domainSpecific = ['lùa gà', 'úp sô', 'đa cấp', 'sập sàn', 'cháy tài khoản', 'khóa học lừa đảo', 'cam kết ảo'];
    } else if (dLower.includes('công nghệ') || dLower.includes('tech') || dLower.includes('đồ gia dụng') || dLower.includes('review')) {
      domainSpecific = ['nhận tiền khen ảo', 'đồ tàu nhái', 'dìm hàng đối thủ', 'review sai công dụng', 'bảo hành kém'];
    } else if (dLower.includes('ẩm thực') || dLower.includes('food') || dLower.includes('ăn uống') || dLower.includes('quán')) {
      domainSpecific = ['mất vệ sinh', 'ngộ độc', 'chê quán', 'thái độ hạch sách', 'bẩn', 'đòi tiền PR'];
    } else if (dLower.includes('thời trang') || dLower.includes('fashion') || dLower.includes('quần áo')) {
      domainSpecific = ['hàng nhái', 'chất vải kém', 'treo đầu dê bán thịt chó', 'quỵt tiền', 'giá chát'];
    } else {
      domainSpecific = ['tẩy chay', 'lùm xùm', 'phát ngôn gây sốc', 'coi thường khán giả', 'bị kiện', 'sao kê'];
    }

    const combined = Array.from(new Set([...domainSpecific, ...universal]));
    const result = combined.slice(0, maxKeywords);
    logger.info(`💡 [KeywordGenerator Heuristic] Selected ${result.length} contextual keywords for domain "${domain}": [ ${result.join(', ')} ]`);
    return result;
  }
}
