import { describe, expect, it } from 'vitest';
import {
  buildDiagnosisScopedPrecautions,
  buildOutpatientRecord,
  OUTPATIENT_RECORD_SCHEMA_VERSION,
  type OutpatientRecord,
  validateOutpatientRecord,
} from './outpatientRecord';
import { buildRecordConfirmedPayload } from './recordConfirmedPayload';

describe('outpatientRecord', () => {
  it('prefills standard history templates while keeping unsupported examination facts empty', () => {
    const record = buildOutpatientRecord({
      chiefComplaint: '办理健康证查体',
      historyOfPresentIllness: '患者自诉无发热、咳嗽、腹痛等不适。',
      diagnosisNames: [],
    });

    expect(record.schemaVersion).toBe(OUTPATIENT_RECORD_SCHEMA_VERSION);
    expect(record.pastMedicalHistory).toContain('否认高血压病史');
    expect(record.personalHistory).toContain('否认吸烟史');
    expect(record.familyHistory).toContain('否认家族重大遗传病史');
    expect(record.physicalExam).toBe('');
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
    expect(record.pastMedicalHistory).toContain('否认手术史');
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

  it('generates customized health prescriptions based on specific diagnoses', () => {
    const record = buildOutpatientRecord({
      chiefComplaint: '多饮多食多尿1个月',
      historyOfPresentIllness: '患者1个月前出现多饮多食多尿，伴体重下降。',
      diagnosisNames: ['II型糖尿病'],
    });

    expect(record.precautions).toContain('控制总热量摄入');
    expect(record.precautions).toContain('每天监测血糖');
  });

  it('merges health prescriptions using round-robin logic and respects safety limits', () => {
    const record = buildOutpatientRecord({
      chiefComplaint: '头晕1周，伴口渴多饮',
      historyOfPresentIllness: '患者既往高血压多年，最近出现口渴多饮。',
      diagnosisNames: ['原发性高血压', 'II型糖尿病'],
    });

    // 验证高血压和糖尿病的两项最核心建议被合理提取
    expect(record.precautions).toContain('少吃咸菜'); // 高血压第1项
    expect(record.precautions).toContain('控制总热量摄入'); // 糖尿病第1项
    expect(record.precautions).toContain('多吃新鲜蔬菜'); // 高血压第2项
    expect(record.precautions).toContain('遵医嘱规律服药'); // 糖尿病第2项
    
    // 验证合并后的总条数限制（共6条）
    const countMatches = (record.precautions.match(/\d\./g) || []).length;
    expect(countMatches).toBe(6);
  });

  it('does not mismatch digestive advice due to negative gastrointestinal symptoms in history text when no digestive diagnosis exists', () => {
    const record = buildOutpatientRecord({
      chiefComplaint: '发热伴咽痛1天',
      historyOfPresentIllness: '患者受凉后发热，伴咽痛。无流涕，无腹痛及腹泻。',
      diagnosisNames: ['急性上呼吸道感染'],
    });

    // 应该只匹配到呼吸道感染的注意事项，不应该出现消化道的条款
    expect(record.precautions).toContain('多喝温开水');
    expect(record.precautions).not.toContain('胃肠药');
    expect(record.precautions).not.toContain('电解质水');
  });

  it('rebuilds scoped precautions without reusing unselected diagnosis content', () => {
    const precautions = buildDiagnosisScopedPrecautions({
      chiefComplaint: '腹痛伴尿频',
      historyOfPresentIllness: '初始候选曾包含膀胱炎。',
      precautions: '膀胱炎患者应注意多饮水并监测尿路症状。',
      diagnosisNames: ['输尿管结石'],
    });

    expect(precautions).not.toContain('膀胱炎');
    expect(precautions).not.toContain('尿路症状');
  });

  it('uses only the selected diagnosis rules when rebuilding scoped precautions', () => {
    const precautions = buildDiagnosisScopedPrecautions({
      chiefComplaint: '发热伴腹泻',
      historyOfPresentIllness: '同时存在呼吸道和消化道症状。',
      diagnosisNames: ['急性上呼吸道感染'],
    });

    expect(precautions).toContain('多喝温开水');
    expect(precautions).not.toContain('胃肠药');
    expect(precautions).not.toContain('电解质水');
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
    expect(payload.precautions).toBe('注意休息，必要时复诊。');
    expect(outpatientRecord).not.toHaveProperty('diagnosisText');
    expect(payload.diagList).toEqual([
      expect.objectContaining({
        idDiag: 'D-URI',
        naDiag: '急性上呼吸道感染',
      }),
    ]);
  });

  it('keeps generated precautions in both the PHIS compatibility field and outpatientRecord', () => {
    const payload = buildRecordConfirmedPayload({
      consultationId: 'consultation-2',
      chiefComplaint: '咳嗽3天',
      historyOfPresentIllness: '患者受凉后出现咳嗽。',
      pastMedicalHistory: '平素体健',
      diagList: [],
      orderList: [],
    });

    const outpatientRecord = payload.outpatientRecord as OutpatientRecord;

    expect(outpatientRecord.precautions).toBeTruthy();
    expect(payload.precautions).toBe(outpatientRecord.precautions);
  });
});
