import { describe, expect, it } from 'vitest';
import appSource from '@/App.vue?raw';
import resultImplementationSource from '@/components/VoiceConsultationNew.vue?raw';
import symptomResultEntrySource from '@features/symptom-consultation/ui/SymptomResultEntry.vue?raw';
import consultationResultPageSource from './ui/ConsultationResultPage.vue?raw';
import clinicalResultEditorStyleSource from './ui/ClinicalResultEditor.css?raw';
import clinicalResultSupplementDialogSource from './ui/ClinicalResultSupplementDialog.vue?raw';

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

  it('keeps supplement regeneration in the shared result implementation', () => {
    expect(resultImplementationSource).toContain('ClinicalResultSupplementDialog');
    expect(resultImplementationSource).toContain('handleSupplementRegenerate');
    expect(resultImplementationSource).toContain("'补充说明'");
    expect(clinicalResultEditorStyleSource).not.toMatch(
      /\.vcn-left-panel\s*>\s*\.section-heading\s*\{[^}]*display:\s*none/s,
    );
    expect(clinicalResultEditorStyleSource).not.toContain('.vcn-left-panel .section-title::before');
    expect(clinicalResultSupplementDialogSource).toContain('正在采集声音');
    expect(clinicalResultSupplementDialogSource).toContain('waveformLevels');
  });
});
