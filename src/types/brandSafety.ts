export type RiskClassification = 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE_MILD' | 'SCANDAL_HIGH_RISK';

export interface ScandalEvent {
  event_title: string;
  summary: string;
  severity_score_0_to_100: number;
  is_verified_by_evidence_or_rumor: 'VERIFIED_EVIDENCE' | 'UNVERIFIED_RUMOR' | 'NOT_APPLICABLE';
  post_url?: string;
  risk_category?: 'FALSE_ADVERTISING' | 'ILLEGAL_OR_IMMORAL' | 'AUDIENCE_DISRESPECT' | 'SEEDING_MANIPULATION' | 'OTHER';
}

export interface PostEvaluationResult {
  post_id: string;
  classification: RiskClassification;
  confidence_score: number;
  reasoning: string;
  scandal_details: ScandalEvent | null;
}

export interface BatchEvaluationResponse {
  evaluations: PostEvaluationResult[];
}

export interface KOLBrandSafetyAuditReport {
  kolName: string;
  auditDate: string;
  executiveSummary: {
    brandSafetyScore: number; // 0 to 100
    riskLevel: 'SAFE' | 'MODERATE_RISK' | 'HIGH_RISK_AVOID';
    totalPostsAnalyzed: number;
    totalCommentsAnalyzed: number;
    classificationCounts: {
      POSITIVE: number;
      NEUTRAL: number;
      NEGATIVE_MILD: number;
      SCANDAL_HIGH_RISK: number;
    };
  };
  scandalChronicle: ScandalEvent[];
  recommendation: {
    cooperationAdvice: string;
    prohibitedCategories: string[];
    safeCategories: string[];
  };
}
