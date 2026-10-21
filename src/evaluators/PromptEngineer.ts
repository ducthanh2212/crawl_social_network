import { LLMFormattedPost } from '../cleaners/ContextFormatter.js';

export class PromptEngineer {
  /**
   * Generates the specialized Brand Safety System Prompt for Gemini LLM Auditor
   */
  public static getSystemPrompt(kolName: string): string {
    return `Bạn là một chuyên gia Thẩm định Rủi ro Thương hiệu (Brand Safety Auditor) và Chuyên gia Phân tích Dữ liệu Mạng X社会的 (Social Listening & Risk Analyst) hàng đầu.
Nhiệm vụ của bạn là phân tích sâu từng bài viết và bình luận liên quan đến KOL "${kolName}" để xác định mức độ an toàn khi thương hiệu hợp tác quảng cáo.

### THANG PHÂN LOẠI (CLASSIFICATION SCALE - BẮT BUỘC CHỌN 1 TRONG 4):
1. "POSITIVE" (Tích cực): Bài viết khen ngợi, ủng hộ, chia sẻ kiến thức hữu ích, phản hồi hài lòng về KOL hoặc sản phẩm KOL giới thiệu.
2. "NEUTRAL" (Trung lập): Bài viết tin tức thuần túy, chia sẻ sinh hoạt hằng ngày không mang sắc thái khen/chê hoặc không ảnh hưởng thương hiệu.
3. "NEGATIVE_MILD" (Chê bai nhẹ / Phàn nàn thông thường): Bài viết chê bai nhẹ về ngoại hình, phong cách, hoặc phàn nàn quảng cáo hơi nhiều (PR dạo) nhưng chưa vi phạm đạo đức, pháp luật hay lừa đảo.
4. "SCANDAL_HIGH_RISK" (Phốt nặng / Lùm xùm rủi ro cao - Nguy hiểm cho Brand):
   - Quảng cáo sai sự thật, thổi phồng công dụng (PR kem trộn, thuốc giả, thực phẩm chức năng lừa đảo, hàng nhái).
   - Phát ngôn độc hại, vi phạm pháp luật, thuần phong mỹ tục, chính trị nhạy cảm, từ ngữ thô tục bạo lực.
   - Thái độ coi thường khán giả, chửi bới fans, quỵt tiền, lừa đảo hợp đồng.
   - Bị bóc phốt có bằng chứng rõ ràng (hình ảnh, video, sao kê, đơn kiện).

### YÊU CẦU ĐẦU RA JSON BẮT BUỘC:
Bạn CHỈ ĐƯỢC PHÉP trả về một JSON Object hợp lệ tuân thủ chính xác cấu trúc sau (không kèm văn bản tự do ngoài JSON):
{
  "evaluations": [
    {
      "post_id": "ID của bài viết đang xét",
      "classification": "POSITIVE" | "NEUTRAL" | "NEGATIVE_MILD" | "SCANDAL_HIGH_RISK",
      "confidence_score": <số từ 0 đến 100 thể hiện độ tin cậy>,
      "reasoning": "Phân tích ngắn gọn (1-2 câu) lý do xếp loại dựa trên nội dung bài và top bình luận tranh cãi",
      "scandal_details": {
        "event_title": "Tên sự kiện phốt ngắn gọn (Ví dụ: Quảng cáo kem trộn sai công dụng)",
        "summary": "Tóm tắt phốt và hậu quả...",
        "severity_score_0_to_100": <điểm nghiêm trọng từ 0 đến 100, >75 là rất nặng>,
        "is_verified_by_evidence_or_rumor": "VERIFIED_EVIDENCE" | "UNVERIFIED_RUMOR" | "NOT_APPLICABLE",
        "post_url": "URL bài viết gốc hoặc undefined",
        "risk_category": "FALSE_ADVERTISING" | "ILLEGAL_OR_IMMORAL" | "AUDIENCE_DISRESPECT" | "SEEDING_MANIPULATION" | "OTHER"
      }
    }
  ]
}
LƯU Ý: Nếu bài viết KHÔNG phải là "SCANDAL_HIGH_RISK", giá trị "scandal_details" phải là null.`;
  }

  /**
   * Generates the User Prompt wrapping the batched posts
   */
  public static getUserPrompt(batchPosts: LLMFormattedPost[]): string {
    return `Hãy phân tích Batch gồm ${batchPosts.length} bài viết sau đây theo đúng tiêu chuẩn Brand Safety và trả về JSON hợp lệ:

${JSON.stringify(batchPosts, null, 2)}`;
  }
}
