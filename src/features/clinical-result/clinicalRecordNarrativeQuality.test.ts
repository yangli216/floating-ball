import { describe, expect, it } from 'vitest';
import {
  getClinicalTermPolarity,
  isNegativeClinicalStatementCovered,
  mergeStructuredNegativeSymptoms,
  normalizeGeneratedClinicalRecordNarrative,
} from './clinicalRecordNarrativeQuality';

describe('clinicalRecordNarrativeQuality', () => {
  it('recognizes every item covered by a grouped negative statement', () => {
    const record = '患者咽痛3天。无鼻塞、流涕。无发热、头痛及四肢酸痛。';

    expect(getClinicalTermPolarity(record, '流涕')).toBe('negative');
    expect(getClinicalTermPolarity(record, '头痛')).toBe('negative');
    expect(getClinicalTermPolarity(record, '四肢酸痛')).toBe('negative');
    expect(isNegativeClinicalStatementCovered(record, '否认流涕、头痛、四肢酸痛。')).toBe(true);
  });

  it('does not append the screenshot duplicate structured negatives', () => {
    const result = mergeStructuredNegativeSymptoms(
      '患者3天前无明显诱因出现咽痛，吞咽时加重。今日自觉咽喉异物感，伴声音嘶哑。偶有咽痒及咳嗽。无鼻塞、流涕。无发热、头痛及四肢酸痛。',
      ['流涕', '头痛', '四肢酸痛'],
    );

    expect(result.text).not.toContain('否认流涕、头痛、四肢酸痛');
    expect(result.text.match(/流涕/gu)).toHaveLength(1);
    expect(result.issues.filter((item) => item.code === 'duplicate-negative-removed')).toHaveLength(3);
  });

  it('keeps only missing items when a later negative sentence partially overlaps', () => {
    const result = normalizeGeneratedClinicalRecordNarrative(
      '患者无发热。否认发热、胸痛。',
      'historyOfPresentIllness',
    );

    expect(result.text).toBe('患者无发热。否认胸痛。');
  });

  it('does not append a structured negative that conflicts with a positive fact', () => {
    const result = mergeStructuredNegativeSymptoms('患者咳嗽3天，伴胸痛。', ['胸痛', '发热']);

    expect(result.text).toBe('患者咳嗽3天，伴胸痛。否认发热。');
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'negative-positive-conflict',
      terms: ['胸痛'],
    }));
  });

  it('removes process placeholders while retaining clinical clauses', () => {
    const result = normalizeGeneratedClinicalRecordNarrative(
      '患者咳嗽3天，其他情况待医生补充完善。病情控制情况待医生核实。',
      'historyOfPresentIllness',
    );

    expect(result.text).toBe('患者咳嗽3天。');
    expect(result.issues.filter((item) => item.code === 'process-placeholder-removed')).toHaveLength(2);
  });

  it('returns an empty field when it only contains a workflow prompt', () => {
    expect(normalizeGeneratedClinicalRecordNarrative('待医生补充完善。').text).toBe('');
  });

  it('removes exact duplicate sentences without changing the first one', () => {
    const result = normalizeGeneratedClinicalRecordNarrative('否认胸痛。否认胸痛。');

    expect(result.text).toBe('否认胸痛。');
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'duplicate-sentence-removed' }));
  });

  it('treats a symptom after an explicit positive transition as positive', () => {
    expect(getClinicalTermPolarity('无发热，伴咳嗽。', '发热')).toBe('negative');
    expect(getClinicalTermPolarity('无发热，伴咳嗽。', '咳嗽')).toBe('positive');
    expect(getClinicalTermPolarity('无明显诱因出现咽痛。', '咽痛')).toBe('positive');
  });

  it('does not mistake characters inside a negative cue for a positive transition', () => {
    expect(getClinicalTermPolarity('未诉胸痛。', '胸痛')).toBe('negative');
    expect(getClinicalTermPolarity('不伴呼吸困难。', '呼吸困难')).toBe('negative');
    expect(getClinicalTermPolarity('未出现发热。', '发热')).toBe('negative');
    expect(getClinicalTermPolarity('未发现皮疹。', '皮疹')).toBe('negative');
    expect(getClinicalTermPolarity('双肺未闻及干湿性啰音。', '干湿性啰音')).toBe('negative');
  });
});
