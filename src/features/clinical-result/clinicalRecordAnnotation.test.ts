import { describe, expect, it } from 'vitest';
import {
  buildClinicalRecordAnnotationSegments,
  replaceClinicalRecordCandidateText,
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
    expect(replaceClinicalRecordCandidateText(
      text,
      '否认胸痛、呼吸困难',
      '活动后胸闷伴气促',
    )).toBe('患者咳嗽，否认发热；活动后胸闷伴气促。');
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
    expect(replaceClinicalRecordCandidateText(
      text,
      '否认胸痛、呼吸困难',
      '活动后胸闷伴气促',
    )).toBe(text);
  });
});
