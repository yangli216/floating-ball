import { describe, expect, it } from 'vitest';
import appSource from '@/App.vue?raw';
import symptomResultEntrySource from '@features/symptom-consultation/ui/SymptomResultEntry.vue?raw';
import consultationResultPageSource from './ui/ConsultationResultPage.vue?raw';

const INTERNAL_IMPLEMENTATION_NAME = 'VoiceConsultationNew';

describe('clinical result architecture boundary', () => {
  it('keeps App on the consultation-result public entry', () => {
    expect(appSource).toContain('ConsultationResultPage');
    expect(appSource).not.toContain(INTERNAL_IMPLEMENTATION_NAME);
  });

  it('keeps symptom consultation on the consultation-result public entry', () => {
    expect(symptomResultEntrySource).toContain('ConsultationResultPage');
    expect(symptomResultEntrySource).not.toContain(INTERNAL_IMPLEMENTATION_NAME);
  });

  it('confines the root implementation dependency to the public result page facade', () => {
    expect(consultationResultPageSource).toContain(INTERNAL_IMPLEMENTATION_NAME);
  });
});
