import type {
  ClinicalResultGenerationSection,
  ClinicalResultGenerationState,
} from '@features/clinical-result';

export type ClinicalResultIntentApplicationMode = 'reset' | 'patch' | 'finalize';

export interface ClinicalResultIntentApplicationPlan {
  mode: ClinicalResultIntentApplicationMode;
  newSections: ClinicalResultGenerationSection[];
  continuesStreamingSession: boolean;
}

export interface ClinicalResultProgressiveIntentInput {
  sessionKey: string;
  generation?: ClinicalResultGenerationState;
}

/**
 * Tracks one generated-result session without touching page state.
 * A streaming session resets once; later partials and the final payload only
 * expose newly completed sections so callers can patch the existing editor.
 */
export function useClinicalResultProgressiveIntentApplication() {
  let activeSessionKey = '';
  let streaming = false;
  const appliedSections = new Set<ClinicalResultGenerationSection>();

  function replaceSections(sections: readonly ClinicalResultGenerationSection[]): void {
    appliedSections.clear();
    sections.forEach((section) => appliedSections.add(section));
  }

  function collectNewSections(
    sections: readonly ClinicalResultGenerationSection[],
  ): ClinicalResultGenerationSection[] {
    const next = sections.filter((section) => !appliedSections.has(section));
    next.forEach((section) => appliedSections.add(section));
    return next;
  }

  function plan(input: ClinicalResultProgressiveIntentInput): ClinicalResultIntentApplicationPlan {
    const generation = input.generation;
    const sections = generation?.readySections || [];
    const sameSession = Boolean(input.sessionKey) && input.sessionKey === activeSessionKey;

    if (generation?.status === 'streaming') {
      if (!sameSession || !streaming) {
        activeSessionKey = input.sessionKey;
        streaming = true;
        replaceSections(sections);
        return {
          mode: 'reset',
          newSections: [...sections],
          continuesStreamingSession: false,
        };
      }
      return {
        mode: 'patch',
        newSections: collectNewSections(sections),
        continuesStreamingSession: true,
      };
    }

    if (generation?.status === 'complete' && sameSession && streaming) {
      const newSections = collectNewSections(sections);
      streaming = false;
      return {
        mode: 'finalize',
        newSections,
        continuesStreamingSession: true,
      };
    }

    activeSessionKey = input.sessionKey;
    streaming = false;
    replaceSections(sections);
    return {
      mode: 'reset',
      newSections: [...sections],
      continuesStreamingSession: false,
    };
  }

  function reset(): void {
    activeSessionKey = '';
    streaming = false;
    appliedSections.clear();
  }

  return { plan, reset };
}

export type ClinicalResultProgressiveIntentApplication = ReturnType<
  typeof useClinicalResultProgressiveIntentApplication
>;
