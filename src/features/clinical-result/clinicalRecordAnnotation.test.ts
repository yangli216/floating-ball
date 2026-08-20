import { describe, expect, it } from 'vitest';
import {
  applyClinicalRecordSuggestionEdit,
  buildClinicalRecordAnnotationSegments,
  isClinicalRecordSuggestionInRecord,
  mergeClinicalRecordSuggestionIntoText,
} from './clinicalRecordAnnotation';
import type {
  ClinicalRecordExplicitFact,
  ClinicalRecordFactSuggestion,
} from './clinicalRecordFactConfirmation';

describe('clinicalRecordAnnotation', () => {
  it('keeps the original record text unchanged while marking matching facts', () => {
    const text = '患者发热1天，否认胸痛、呼吸困难。';
    const facts: ClinicalRecordExplicitFact[] = [
      {
        id: 'positive-fever',
        field: 'historyOfPresentIllness',
        text: '发热',
        source: 'structured-answer',
        polarity: 'positive',
      },
      {
        id: 'negative-chest-pain',
        field: 'historyOfPresentIllness',
        text: '否认胸痛、呼吸困难',
        source: 'record-explicit',
        polarity: 'negative',
      },
    ];

    const segments = buildClinicalRecordAnnotationSegments(text, facts);

    expect(segments.map((item) => item.text).join('')).toBe(text);
    expect(segments.filter((item) => item.kind === 'fact')).toEqual([
      expect.objectContaining({ text: '发热', fact: expect.objectContaining({ polarity: 'positive' }) }),
      expect.objectContaining({ text: '否认胸痛、呼吸困难', fact: expect.objectContaining({ polarity: 'negative' }) }),
    ]);
  });

  it('prefers a longer fact when ranges overlap', () => {
    const segments = buildClinicalRecordAnnotationSegments('否认胸痛、呼吸困难。', [
      {
        id: 'short',
        field: 'historyOfPresentIllness',
        text: '胸痛',
        source: 'structured-answer',
        polarity: 'positive',
      },
      {
        id: 'long',
        field: 'historyOfPresentIllness',
        text: '否认胸痛、呼吸困难',
        source: 'record-explicit',
        polarity: 'negative',
      },
    ]);

    expect(segments.filter((item) => item.kind === 'fact')).toEqual([
      expect.objectContaining({ fact: expect.objectContaining({ id: 'long' }) }),
    ]);
  });

  it('marks an existing broader negative sentence in place instead of appending a duplicate AI candidate', () => {
    const text = '患者咳嗽，否认发热、胸痛及呼吸困难。';
    const suggestions: ClinicalRecordFactSuggestion[] = [{
      id: 'check-chest-risk',
      field: 'historyOfPresentIllness',
      question: '是否伴胸痛或呼吸困难？',
      negativeRecordText: '否认胸痛、呼吸困难',
      rationale: '核查呼吸系统高风险症状',
      priority: 'critical',
      status: 'pending',
    }];

    const segments = buildClinicalRecordAnnotationSegments(text, [], suggestions);

    expect(segments.map((item) => item.text).join('')).toBe(text);
    expect(segments.filter((item) => item.kind === 'suggestion')).toEqual([
      expect.objectContaining({
        text: '否认发热、胸痛及呼吸困难',
        suggestion: expect.objectContaining({ id: 'check-chest-risk' }),
      }),
    ]);
  });

  it('marks a single-term candidate inside a grouped negative sentence', () => {
    const text = '患者咽痛3天，无鼻塞、流涕。';
    const suggestions: ClinicalRecordFactSuggestion[] = [{
      id: 'check-rhinorrhea',
      field: 'historyOfPresentIllness',
      question: '是否伴流涕？',
      negativeRecordText: '无流涕',
      rationale: '核查上呼吸道伴随症状',
      priority: 'general',
      status: 'pending',
    }];

    const segments = buildClinicalRecordAnnotationSegments(text, [], suggestions);

    expect(segments.map((item) => item.text).join('')).toBe(text);
    expect(segments.filter((item) => item.kind === 'suggestion')).toEqual([
      expect.objectContaining({
        text: '无鼻塞、流涕',
        suggestion: expect.objectContaining({ id: 'check-rhinorrhea' }),
      }),
    ]);
  });

  it('does not match a positive sentence as an existing negative candidate', () => {
    const text = '患者胸痛伴呼吸困难。';
    const suggestions: ClinicalRecordFactSuggestion[] = [{
      id: 'check-chest-risk',
      field: 'historyOfPresentIllness',
      question: '是否伴胸痛或呼吸困难？',
      negativeRecordText: '否认胸痛、呼吸困难',
      rationale: '核查呼吸系统高风险症状',
      priority: 'critical',
      status: 'pending',
    }];

    const segments = buildClinicalRecordAnnotationSegments(text, [], suggestions);

    expect(segments).toEqual([{ kind: 'text', text }]);
  });

  it('replaces or removes the exact rendered range after a doctor action', () => {
    const text = '患者咳嗽，否认发热、胸痛及呼吸困难。';
    const suggestion: ClinicalRecordFactSuggestion = {
      id: 'check-chest-risk',
      field: 'historyOfPresentIllness',
      question: '是否伴胸痛或呼吸困难？',
      negativeRecordText: '否认胸痛、呼吸困难',
      rationale: '核查呼吸系统高风险症状',
      priority: 'critical',
      status: 'pending',
    };
    const segment = buildClinicalRecordAnnotationSegments(text, [], [suggestion])
      .find((item) => item.kind === 'suggestion');

    expect(segment?.kind).toBe('suggestion');
    if (!segment || segment.kind !== 'suggestion') return;
    expect(isClinicalRecordSuggestionInRecord(text, segment)).toBe(true);
    expect(applyClinicalRecordSuggestionEdit(text, segment, '否认胸痛，但活动后稍感气促')).toBe(
      '患者咳嗽，否认胸痛，但活动后稍感气促。',
    );
    expect(applyClinicalRecordSuggestionEdit(text, segment, '')).toBe('患者咳嗽。');
  });

  it('merges an unmatched AI candidate into the persisted record by default and remains idempotent', () => {
    const suggestion: ClinicalRecordFactSuggestion = {
      id: 'check-medication',
      field: 'historyOfPresentIllness',
      question: '目前使用哪些降压药？',
      negativeRecordText: '目前未服用噻嗪类或袢利尿剂',
      rationale: '核查低钠风险',
      priority: 'critical',
      status: 'pending',
    };
    const merged = mergeClinicalRecordSuggestionIntoText('血压控制平稳。', suggestion);

    expect(merged).toBe('血压控制平稳。目前未服用噻嗪类或袢利尿剂。');
    expect(mergeClinicalRecordSuggestionIntoText(merged, suggestion)).toBe(merged);
  });

  it('does not append a candidate already covered by a grouped negative sentence', () => {
    const suggestion: ClinicalRecordFactSuggestion = {
      id: 'check-rhinorrhea',
      field: 'historyOfPresentIllness',
      question: '是否伴流涕？',
      negativeRecordText: '无流涕',
      rationale: '核查伴随症状',
      priority: 'general',
      status: 'pending',
    };
    const record = '患者咽痛3天，无鼻塞、流涕。';

    expect(mergeClinicalRecordSuggestionIntoText(record, suggestion)).toBe(record);
  });
});
