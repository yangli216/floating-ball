import { computed, ref } from 'vue';
import { trackClick, trackError } from '../services/operationTracker';
import { checkVoiceSafetyReview } from '../services/factChecker';
import { extractRecentMedications, getPatientMemory } from '../services/patientMemoryStore';
import type {
  GeneratedRecord,
  PatientInfo,
  VoiceSafetyIssue,
  VoiceSafetyReviewResult,
} from '../types/voiceResult';
import { getPatientContextAllergyHistory, getPatientContextId } from '../utils/patientContext';

export type VoiceSafetyReviewStatus = 'idle' | 'checking' | 'completed' | 'failed';

export function useVoiceSafetyReview() {
  const status = ref<VoiceSafetyReviewStatus>('idle');
  const issues = ref<VoiceSafetyIssue[]>([]);
  const checkedAt = ref<number | null>(null);
  const errorMessage = ref('');
  let reviewToken = 0;

  const activeIssues = computed(() => issues.value.filter(issue => !issue.dismissed));
  const highRiskIssues = computed(() => activeIssues.value.filter(issue => issue.severity === 'high'));
  const unacknowledgedHighRiskIssues = computed(() => highRiskIssues.value.filter(issue => !issue.acknowledged));
  const hasIssues = computed(() => activeIssues.value.length > 0);
  const needsSubmitAwareness = computed(() => unacknowledgedHighRiskIssues.value.length > 0);

  async function runSafetyReview(record: GeneratedRecord, patientInfo?: PatientInfo | null): Promise<VoiceSafetyReviewResult | null> {
    const currentToken = reviewToken + 1;
    reviewToken = currentToken;
    status.value = 'checking';
    errorMessage.value = '';
    issues.value = [];
    checkedAt.value = null;

    try {
      const patientId = getPatientContextId(patientInfo);
      const memory = patientId ? await getPatientMemory(patientId) : null;
      const recentMedications = extractRecentMedications(memory);
      // 累积过敏史：如果粘贴中不含某些上次上传的过敏项，仍以累计值为准补足
      const baseAllergy = getPatientContextAllergyHistory(patientInfo);
      const memoryAllergies = memory?.allergyHistory || [];
      const mergedAllergy = memoryAllergies.length
        ? [baseAllergy, memoryAllergies.filter(a => !baseAllergy.includes(a)).join('、')]
            .filter(Boolean)
            .join('、')
        : baseAllergy;

      const result = await checkVoiceSafetyReview({
        record,
        patientInfo,
        allergyHistory: mergedAllergy || undefined,
        recentMedications,
      });

      if (currentToken !== reviewToken) {
        return null;
      }

      issues.value = result.issues;
      checkedAt.value = result.checkedAt;
      status.value = 'completed';
      trackClick('voice_safety_review_completed', {
        issueCount: result.issues.length,
        highRiskCount: result.issues.filter(issue => issue.severity === 'high').length,
      });
      return result;
    } catch (error) {
      if (currentToken !== reviewToken) {
        return null;
      }
      console.error('Voice safety review failed:', error);
      trackError('voice_safety_review_failed', error);
      errorMessage.value = error instanceof Error ? error.message : String(error);
      status.value = 'failed';
      return null;
    }
  }

  function acknowledgeIssue(issueId: string): void {
    issues.value = issues.value.map(issue => issue.id === issueId ? { ...issue, acknowledged: true } : issue);
    trackClick('voice_safety_issue_acknowledged', { issueId });
  }

  function dismissIssue(issueId: string): void {
    issues.value = issues.value.map(issue => issue.id === issueId ? { ...issue, dismissed: true, acknowledged: true } : issue);
    trackClick('voice_safety_issue_dismissed', { issueId });
  }

  function acknowledgeAllHighRisk(): void {
    const highRiskIds = new Set(highRiskIssues.value.map(issue => issue.id));
    issues.value = issues.value.map(issue => highRiskIds.has(issue.id) ? { ...issue, acknowledged: true } : issue);
    trackClick('voice_safety_high_risk_acknowledged', { count: highRiskIds.size });
  }

  return {
    status,
    issues,
    activeIssues,
    highRiskIssues,
    unacknowledgedHighRiskIssues,
    hasIssues,
    needsSubmitAwareness,
    checkedAt,
    errorMessage,
    runSafetyReview,
    acknowledgeIssue,
    dismissIssue,
    acknowledgeAllHighRisk,
  };
}
