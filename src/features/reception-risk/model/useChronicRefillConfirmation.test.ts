import { describe, expect, it, vi } from 'vitest';
import { buildPatientContext } from '@/utils/patientContext';
import type { ChronicRefillCandidate } from '../lib/chronicRefillAssessment';
import type { ChronicRefillConfirmationPlan } from '../lib/chronicRefillConfirmation';
import { useChronicRefillConfirmation } from './useChronicRefillConfirmation';

const patient = buildPatientContext({
  payload: { patientId: 'patient-1', visitId: 'visit-1', name: '测试患者' },
})!;
const candidate: ChronicRefillCandidate = {
  diagnosis: '高血压',
  diagnoses: ['高血压'],
  diagnosisGroups: ['高血压'],
  medications: ['苯磺酸氨氯地平片'],
  chronicVisitCount: 1,
  chronicVisits: [],
  diagnosisEvidenceText: '',
  medicationEvidenceText: '',
  evidenceText: '',
};
const plan: ChronicRefillConfirmationPlan = {
  summary: '确认必要信息',
  items: [{
    id: 'control',
    question: '近期控制情况？',
    description: '',
    options: [
      { value: 'stable', label: '平稳', recordText: '近期控制平稳' },
      { value: 'unknown', label: '暂未确认', recordText: '' },
    ],
    recommendedValue: 'stable',
    confidence: 'high',
    evidence: 'current-explicit',
    basis: '本次补充',
  }],
};

describe('useChronicRefillConfirmation', () => {
  it('applies recommended options without regenerating them after voice transcription', async () => {
    const generatePlan = vi.fn(async () => plan);
    const controller = useChronicRefillConfirmation({
      patient,
      candidate,
      generatePlan,
      generateRecord: vi.fn(),
      startRecording: vi.fn(),
      stopRecording: vi.fn(async () => new Blob(['audio'])),
      transcribe: vi.fn(async () => '规律服药，近期血压平稳'),
      getRecordingErrorMessage: (error) => String(error),
    });

    await controller.loadPlan();
    expect(controller.selections.value).toEqual({ control: 'stable' });

    await controller.toggleVoiceSupplement();
    expect(controller.isRecording.value).toBe(true);
    await controller.toggleVoiceSupplement();

    expect(controller.supplementText.value).toBe('规律服药，近期血压平稳');
    expect(generatePlan).toHaveBeenCalledOnce();
    expect(generatePlan).toHaveBeenCalledWith(patient, expect.objectContaining({
      diagnoses: ['高血压'],
      medications: ['苯磺酸氨氯地平片'],
    }));
    expect(controller.isRecording.value).toBe(false);
  });

  it('requires multi-condition confirmation and only sends the scoped disease to plan and record generation', async () => {
    const multiCandidate: ChronicRefillCandidate = {
      diagnosis: '高血压',
      diagnoses: ['高血压', '2型糖尿病'],
      diagnosisGroups: ['高血压', '糖尿病'],
      medications: ['苯磺酸氨氯地平片', '盐酸二甲双胍片'],
      chronicVisitCount: 2,
      chronicVisits: [
        {
          visitTime: Date.parse('2026-06-20T08:00:00+08:00'),
          diagnoses: ['高血压'],
          medications: ['苯磺酸氨氯地平片'],
        },
        {
          visitTime: Date.parse('2026-06-10T08:00:00+08:00'),
          diagnoses: ['2型糖尿病'],
          medications: ['盐酸二甲双胍片'],
        },
      ],
      diagnosisEvidenceText: '',
      medicationEvidenceText: '',
      evidenceText: '',
      conditions: [
        { id: '高血压', diagnosis: '高血压', diagnosisGroup: '高血压', hasMedicationEvidence: true },
        { id: '糖尿病', diagnosis: '2型糖尿病', diagnosisGroup: '糖尿病', hasMedicationEvidence: true },
      ],
    };
    const generatePlan = vi.fn(async () => plan);
    const generateRecord = vi.fn(async () => ({ channel: 'chronic-refill' } as any));
    const controller = useChronicRefillConfirmation({
      patient,
      candidate: multiCandidate,
      generatePlan,
      generateRecord,
      startRecording: vi.fn(),
      stopRecording: vi.fn(async () => new Blob()),
      transcribe: vi.fn(),
      getRecordingErrorMessage: (error) => String(error),
    });

    expect(controller.selectedConditionIds.value).toEqual([]);
    expect(controller.canGenerate.value).toBe(false);
    expect(generatePlan).not.toHaveBeenCalled();

    controller.toggleCondition('高血压');
    await controller.confirmConditions();

    expect(generatePlan).toHaveBeenCalledWith(patient, expect.objectContaining({
      diagnoses: ['高血压'],
      medications: ['苯磺酸氨氯地平片'],
      chronicVisitCount: 1,
    }));
    await controller.generateRecord();
    expect(generateRecord).toHaveBeenCalledWith(
      patient,
      expect.objectContaining({
        diagnoses: ['高血压'],
        medications: ['苯磺酸氨氯地平片'],
      }),
      expect.objectContaining({ answers: expect.any(Array) }),
    );
  });
});
