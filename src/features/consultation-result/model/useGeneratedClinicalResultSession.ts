import type { Ref } from 'vue';
import type {
  ClinicalResultChannel,
  ClinicalResultGenerationStage,
  ClinicalResultInput,
} from '@features/clinical-result';

export interface BeginGeneratedClinicalResultInput {
  channel: ClinicalResultChannel;
  message: string;
  stage?: ClinicalResultGenerationStage;
}

export interface GeneratedClinicalResultProgress {
  message: string;
  stage: ClinicalResultGenerationStage;
}

export interface GeneratedClinicalResultSessionOptions {
  intentResult: Ref<ClinicalResultInput | null>;
  intentSource: Ref<'llm' | 'cache' | null>;
  consultationRoundId: Ref<string | null>;
  resetCurrentSession: () => void;
  openResultView: () => Promise<void>;
  cloneResult: (result: ClinicalResultInput) => ClinicalResultInput;
  onOpenError?: (error: unknown) => void;
}

function createGeneratedPlaceholder(input: BeginGeneratedClinicalResultInput): ClinicalResultInput {
  return {
    chiefComplaint: '',
    historyOfPresentIllness: '',
    pastMedicalHistory: '',
    allergyHistory: '',
    currentMedicationHistory: '',
    familyHistory: '',
    symptoms: [],
    negativeSymptoms: [],
    diagnoses: [],
    treatments: [],
    treatmentPlan: '',
    healthEducation: '',
    recommendationPolicy: {
      autoFetchTreatments: false,
      allowTreatmentRefresh: false,
      allowedTreatmentTypes: [],
    },
    generation: {
      status: 'streaming',
      readySections: [],
      stage: input.stage || 'preparing-context',
      message: input.message,
    },
    channel: input.channel,
  };
}

export function useGeneratedClinicalResultSession(options: GeneratedClinicalResultSessionOptions) {
  let activeSessionId: string | null = null;

  function isActive(sessionId: string): boolean {
    return activeSessionId === sessionId;
  }

  function invalidate(): void {
    activeSessionId = null;
  }

  async function begin(input: BeginGeneratedClinicalResultInput): Promise<string> {
    options.resetCurrentSession();
    const sessionId = crypto.randomUUID();
    activeSessionId = sessionId;
    options.consultationRoundId.value = sessionId;
    options.intentSource.value = 'llm';
    options.intentResult.value = createGeneratedPlaceholder(input);
    void options.openResultView().catch((error) => {
      fail(sessionId, '无法打开结果页面，请稍后重试');
      options.onOpenError?.(error);
    });
    return sessionId;
  }

  function updateProgress(sessionId: string, progress: GeneratedClinicalResultProgress): boolean {
    if (!isActive(sessionId) || !options.intentResult.value) return false;
    options.intentResult.value = {
      ...options.intentResult.value,
      generation: {
        status: 'streaming',
        readySections: options.intentResult.value.generation?.readySections || [],
        stage: progress.stage,
        message: progress.message,
      },
    };
    return true;
  }

  function updatePartial(sessionId: string, result: ClinicalResultInput): boolean {
    if (!isActive(sessionId)) return false;
    options.intentSource.value = 'llm';
    options.intentResult.value = options.cloneResult({
      ...result,
      generation: {
        status: 'streaming',
        readySections: result.generation?.readySections || [],
        stage: result.generation?.stage,
        message: result.generation?.message,
      },
    });
    return true;
  }

  function complete(sessionId: string, result: ClinicalResultInput): boolean {
    if (!isActive(sessionId)) return false;
    activeSessionId = null;
    options.intentSource.value = 'llm';
    options.intentResult.value = options.cloneResult({
      ...result,
      generation: {
        status: 'complete',
        readySections: result.generation?.readySections || [],
      },
    });
    return true;
  }

  function fail(sessionId: string, message: string): boolean {
    if (!isActive(sessionId) || !options.intentResult.value) return false;
    activeSessionId = null;
    options.intentResult.value = {
      ...options.intentResult.value,
      generation: {
        status: 'error',
        readySections: [],
        stage: options.intentResult.value.generation?.stage,
        message,
      },
    };
    return true;
  }

  return {
    begin,
    complete,
    fail,
    invalidate,
    isActive,
    updatePartial,
    updateProgress,
  };
}

export type GeneratedClinicalResultSession = ReturnType<typeof useGeneratedClinicalResultSession>;
