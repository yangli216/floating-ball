import { describe, expect, it } from 'vitest';
import {
  buildOutpatientRecord,
  OUTPATIENT_RECORD_SCHEMA_VERSION,
  type OutpatientRecord,
  validateOutpatientRecord,
} from './outpatientRecord';
import { buildRecordConfirmedPayload } from './recordConfirmedPayload';

describe('outpatientRecord', () => {
  it('builds a health exam record without fabricating vital signs or diagnosisText', () => {
    const record = buildOutpatientRecord({
      chiefComplaint: '办理健康证查体',
      historyOfPresentIllness: '患者自诉无发热、咳嗽、腹痛等不适。',
      diagnosisNames: [],
    });

    expect(record.schemaVersion).toBe(OUTPATIENT_RECORD_SCHEMA_VERSION);
    expect(record.pastMedicalHistory).toContain('否认高血压病史');
    expect(record.personalHistory).toContain('否认吸烟史');
    expect(record.familyHistory).toContain('否认家族重大遗传病史');
    expect(record.physicalExam).toContain('心肺腹查体未见明显异常');
    expect(record.physicalExam).not.toMatch(/体温|血压|脉搏|呼吸\d/u);
    expect(record).not.toHaveProperty('diagnosisText');
  });

  it('does not deny chronic disease history when diagList contains chronic diagnoses', () => {
    const record = buildOutpatientRecord({
      chiefComplaint: '高血压复诊配药',
      historyOfPresentIllness: '患者既往高血压多年，规律服药，今来续方。',
      diagnosisNames: ['原发性高血压'],
    });

    expect(record.pastMedicalHistory).toContain('既往有原发性高血压病史');
    expect(record.pastMedicalHistory).not.toContain('否认高血压');
    expect(validateOutpatientRecord(record, {
      chiefComplaint: '高血压复诊配药',
      historyOfPresentIllness: '患者既往高血压多年，规律服药，今来续方。',
      diagnosisNames: ['原发性高血压'],
    })).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: 'error', field: 'pastMedicalHistory' }),
    ]));
  });

  it('flags diagnosisText leakage and left-right mismatch risks', () => {
    const record = {
      ...buildOutpatientRecord({
        chiefComplaint: '右膝外伤疼痛1天',
        historyOfPresentIllness: '患者右膝外伤后疼痛，活动受限。',
        diagnosisNames: ['右膝挫伤'],
      }),
      physicalExam: '左膝局部压痛，活动受限。',
      diagnosisText: '右膝挫伤',
    } as OutpatientRecord;

    const issues = validateOutpatientRecord(record, {
      chiefComplaint: '右膝外伤疼痛1天',
      historyOfPresentIllness: '患者右膝外伤后疼痛，活动受限。',
      diagnosisNames: ['右膝挫伤'],
    });

    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: 'error', field: 'diagList' }),
      expect.objectContaining({ severity: 'warning', field: 'physicalExam' }),
    ]));
  });
});

describe('buildRecordConfirmedPayload outpatientRecord', () => {
  it('adds a full outpatientRecord while keeping diagnosis source in diagList', () => {
    const payload = buildRecordConfirmedPayload({
      consultationId: 'consultation-1',
      requestId: 'request-1',
      chiefComplaint: '咳嗽3天',
      historyOfPresentIllness: '患者3天前受凉后出现咳嗽，偶有咳痰。',
      pastMedicalHistory: '平素体健',
      outpatientRecord: {
        personalHistory: '个人史：否认吸烟史，否认饮酒史。',
        physicalExam: '双肺呼吸音清，未闻及干湿啰音。',
        precautions: '注意休息，必要时复诊。',
      },
      diagList: [
        {
          idDiag: 'D-URI',
          naDiag: '急性上呼吸道感染',
          fgMain: '1',
        },
      ],
      orderList: [],
    });

    const outpatientRecord = payload.outpatientRecord as OutpatientRecord;

    expect(outpatientRecord.schemaVersion).toBe(OUTPATIENT_RECORD_SCHEMA_VERSION);
    expect(outpatientRecord.personalHistory).toBe('否认吸烟史，否认饮酒史。');
    expect(outpatientRecord.physicalExam).toBe('双肺呼吸音清，未闻及干湿啰音。');
    expect(outpatientRecord.precautions).toBe('注意休息，必要时复诊。');
    expect(outpatientRecord).not.toHaveProperty('diagnosisText');
    expect(payload.diagList).toEqual([
      expect.objectContaining({
        idDiag: 'D-URI',
        naDiag: '急性上呼吸道感染',
      }),
    ]);
  });
});
