import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import { buildPatientContext } from '@/utils/patientContext';
import { useReceptionSessionController } from './useReceptionSessionController';

describe('useReceptionSessionController', () => {
  it('derives patient display data and changes assessment state only through actions', () => {
    const patient = ref(buildPatientContext({
      payload: {
        patientId: 'patient-1',
        visitId: 'visit-1',
        name: '张建国',
        gender: 'F',
        ageText: '63岁',
      },
    }));
    const session = useReceptionSessionController(patient);

    expect(session.patientName.value).toBe('张建国');
    expect(session.patientGender.value).toBe('F');
    expect(session.patientAgeText.value).toBe('63岁');

    session.startAssessing();
    session.setRisks([{ level: 2, category: 'chronic', content: '高血压随访' }]);
    session.replaceOpportunity('chronic-refill', {
      type: 'chronic-refill',
      candidate: {
        diagnosis: '高血压',
        diagnoses: ['高血压'],
        diagnosisGroups: ['高血压'],
        medications: ['苯磺酸氨氯地平片'],
        chronicVisitCount: 1,
        chronicVisits: [],
        diagnosisEvidenceText: '近期历史就诊记录有“高血压”诊断',
        medicationEvidenceText: '历史用药记录：苯磺酸氨氯地平片',
        evidenceText: '近90天就诊中存在高血压慢病就诊和配药',
      },
    });
    session.finishAssessment();

    expect(session.status.value).toBe('ready');
    expect(session.risks.value).toHaveLength(1);
    expect(session.chronicRefillCandidate.value?.diagnosis).toBe('高血压');

    session.startPatientMemorySync();
    expect(session.patientMemoryStatus.value).toBe('syncing');
    session.setPatientMemoryBrief({
      memoryId: 'memory-1',
      memoryVersion: 2,
      patientId: 'patient-1',
      qualityStatus: 'fresh',
      conflictCount: 0,
      allergies: [],
      chronicConditions: [],
      recentDiagnoses: [],
      recentMedications: [],
      otherFacts: [],
    });
    expect(session.patientMemoryStatus.value).toBe('ready');
    expect(session.patientMemoryBrief.value?.memoryVersion).toBe(2);

    session.reset();
    expect(session.status.value).toBe('idle');
    expect(session.opportunities.value).toEqual([]);
    expect(session.patientMemoryStatus.value).toBe('idle');
    expect(session.patientMemoryBrief.value).toBeNull();
  });

  it('preserves a composite infant age instead of parsing it as years', () => {
    const patient = ref(buildPatientContext({
      payload: {
        patientId: 'patient-infant',
        visitId: 'visit-infant',
        name: '婴儿患者',
        gender: 'F',
        ageText: '6月15天',
      },
    }));
    const session = useReceptionSessionController(patient);

    expect(session.patientAgeText.value).toBe('6月15天');
  });
});
