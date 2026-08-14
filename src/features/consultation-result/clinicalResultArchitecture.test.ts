import { describe, expect, it } from 'vitest';
import appSource from '@/App.vue?raw';
import resultImplementationSource from '@/components/VoiceConsultationNew.vue?raw';
import symptomResultEntrySource from '@features/symptom-consultation/ui/SymptomResultEntry.vue?raw';
import consultationResultPageSource from './ui/ConsultationResultPage.vue?raw';
import clinicalResultEditorStyleSource from './ui/ClinicalResultEditor.css?raw';
import clinicalResultSupplementDialogSource from './ui/ClinicalResultSupplementDialog.vue?raw';
import clinicalDecisionDisclaimerSource from './ui/ClinicalDecisionDisclaimer.vue?raw';
import clinicalRecordAnnotatedTextSource from './ui/ClinicalRecordAnnotatedText.vue?raw';
import clinicalRecordFactPanelSource from './ui/ClinicalRecordFactPanel.vue?raw';
import diagnosisRecommendationCardSource from './ui/DiagnosisRecommendationCard.vue?raw';
import voiceRecordFieldEditorSource from '@features/voice-consultation/ui/VoiceRecordFieldEditor.vue?raw';

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

  it('keeps the clinical decision disclaimer next to the shared writeback action', () => {
    expect(resultImplementationSource).toContain('ClinicalDecisionDisclaimer');
    expect(resultImplementationSource).toMatch(
      /<div class="voice-footer">\s*<ClinicalDecisionDisclaimer \/>/s,
    );
    expect(clinicalDecisionDisclaimerSource).toContain('AI 内容仅供辅助参考');
    expect(clinicalDecisionDisclaimerSource).toContain('确认后回写');
  });

  it('renders record facts in the original text and keeps pending AI text out of the field value', () => {
    expect(voiceRecordFieldEditorSource).toContain('ClinicalRecordAnnotatedText');
    expect(voiceRecordFieldEditorSource).not.toContain('record-field-fact-highlights');
    expect(clinicalRecordAnnotatedTextSource).toContain('pendingSuggestions');
    expect(clinicalRecordAnnotatedTextSource).not.toContain('AI补充·待核查');
    expect(clinicalRecordAnnotatedTextSource).not.toContain('模板预制');
    expect(clinicalRecordAnnotatedTextSource).not.toContain('clinical-record-template-badge');
    expect(clinicalRecordAnnotatedTextSource).toContain('AI 生成，尚非患者事实');
    expect(clinicalRecordAnnotatedTextSource).toContain('未记录（点击补充）');
    expect(clinicalRecordAnnotatedTextSource).toContain('text-align: left');
    expect(clinicalRecordAnnotatedTextSource).not.toContain("emit('update:modelValue', suggestion.negativeRecordText)");
    expect(clinicalRecordFactPanelSource).not.toContain('record-fact-chip');
    expect(clinicalRecordFactPanelSource).toContain('无待核查项');
    expect(clinicalRecordFactPanelSource).toContain('AI补充核查');
    expect(clinicalRecordFactPanelSource).not.toContain('record-fact-legend');
    expect(clinicalRecordFactPanelSource).not.toContain('阳性 {{');
    expect(resultImplementationSource).toContain(':fact-suggestions="getRecordFieldFactSuggestions');
    expect(resultImplementationSource).toContain('hasPendingFactSuggestions');
    expect(resultImplementationSource).toContain('clinical-record-ai-notice');
    expect(resultImplementationSource).toContain('病历中带 AI 或 ! 标记的内容由 AI 补充');
    expect(resultImplementationSource).not.toContain('formalDiagnoses.value.length > 0 && factSuggestions.value.length === 0');
  });

  it('keeps record details free of field-level feedback overlays', () => {
    expect(voiceRecordFieldEditorSource).not.toContain('VoiceRecordFeedbackPopover');
    expect(voiceRecordFieldEditorSource).not.toContain('voice-feedback-trigger');
    expect(voiceRecordFieldEditorSource).not.toContain('padding-right: 135px');
    expect(resultImplementationSource).not.toContain('@submit-feedback="handleRecordFieldFeedbackSubmit"');
    expect(resultImplementationSource).not.toContain(':feedback-key="getRecordFieldFeedbackKey');
  });

  it('shows highlighted differential points in a dismissible anchored layer', () => {
    expect(resultImplementationSource).toContain(':differential-preview="getDiagnosisChecklistPreview(diag)"');
    expect(resultImplementationSource).toContain(':differential-open="isDiagnosisChecklistOpen(diag)"');
    expect(resultImplementationSource).toContain('@close-differential="handleCloseDiagnosisDifferential(diag, $event)"');
    expect(diagnosisRecommendationCardSource).toContain('diagnosis-differential-anchor');
    expect(diagnosisRecommendationCardSource).toContain('diagnosis-differential-panel');
    expect(diagnosisRecommendationCardSource).toContain('主诊断核查要点');
    expect(diagnosisRecommendationCardSource).toContain('diagnosis-differential-keyword');
    expect(diagnosisRecommendationCardSource).toContain('close-differential');
    expect(diagnosisRecommendationCardSource).toContain('关闭主诊断核查要点');
    expect(diagnosisRecommendationCardSource).toContain('width: min(520px, 70vw)');
    expect(diagnosisRecommendationCardSource).toMatch(/diagnosis-differential-points li[\s\S]*font-size: 13px/);
    expect(diagnosisRecommendationCardSource).toContain('diagnosis-differential-confirm');
    expect(diagnosisRecommendationCardSource).toContain('已确认并关闭主诊断核查要点');
    expect(diagnosisRecommendationCardSource).not.toContain('已完整展示');
    expect(diagnosisRecommendationCardSource).not.toContain('内容较多时可在框内滚动');
    expect(diagnosisRecommendationCardSource).not.toContain('diagnosis-differential-panel-hint');
    expect(diagnosisRecommendationCardSource).toMatch(
      /\.diagnosis-differential-keyword\s*\{[^}]*background:\s*transparent[^}]*font-weight:\s*700/s,
    );
    expect(diagnosisRecommendationCardSource).not.toMatch(
      /\.diagnosis-differential-keyword\s*\{[^}]*background:\s*rgba/s,
    );
    expect(diagnosisRecommendationCardSource).toContain('overflow-y: auto');
    expect(diagnosisRecommendationCardSource).not.toContain('.slice(0, 3)');
    expect(diagnosisRecommendationCardSource).not.toContain('-webkit-line-clamp');
    expect(diagnosisRecommendationCardSource).not.toContain('diagnosis-differential-preview-summary');
    expect(diagnosisRecommendationCardSource).not.toContain('diagnosis-differential-hover');
    expect(resultImplementationSource).not.toContain('checklist-overlay');
    expect(resultImplementationSource).not.toContain('鉴别排查确认');
  });
});
