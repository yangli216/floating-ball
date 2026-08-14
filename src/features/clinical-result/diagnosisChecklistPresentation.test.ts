import { describe, expect, it } from 'vitest';
import { buildDiagnosisChecklistHighlightSegments } from './diagnosisChecklistPresentation';

describe('diagnosisChecklistPresentation', () => {
  it('preserves the original text while highlighting clinical phrases instead of action words', () => {
    const text = '确认无活动后气促、夜间阵发性呼吸困难或下肢水肿（排除心源性咳嗽及心衰）';
    const segments = buildDiagnosisChecklistHighlightSegments(text);

    expect(segments.map((item) => item.text).join('')).toBe(text);
    expect(segments.filter((item) => item.highlighted).map((item) => item.text)).toEqual([
      '活动后气促',
      '夜间阵发性呼吸困难或下肢水肿',
      '心源性咳嗽及心衰',
    ]);
    expect(segments.find((item) => item.text === '确认无')?.highlighted).toBe(false);
    expect(segments.find((item) => item.text.includes('排除'))?.highlighted).toBe(false);
  });

  it('highlights the unexplained clinical signal in a diagnosis mismatch warning', () => {
    const segments = buildDiagnosisChecklistHighlightSegments('当前诊断不能解释高热');

    expect(segments).toEqual([
      { text: '当前诊断不能解释', highlighted: false },
      { text: '高热', highlighted: true },
    ]);
  });

  it('returns an empty list for empty text', () => {
    expect(buildDiagnosisChecklistHighlightSegments('')).toEqual([]);
  });
});
