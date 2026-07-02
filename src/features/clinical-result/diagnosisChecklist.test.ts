import { describe, expect, it } from 'vitest';
import {
  buildDiagnosisChecklistMismatchError,
  buildDiagnosisChecklistRiskIssues,
  normalizeDiagnosisChecklistItems,
  parseDiagnosisChecklistResponse,
} from './diagnosisChecklist';

describe('diagnosis checklist rules', () => {
  it('parses a checklist from an LLM response envelope', () => {
    const parsed = parseDiagnosisChecklistResponse(`说明文字\n\`\`\`json
      {"isNeeded":true,"items":[{"question":" 复核胸痛性质 ","recordText":" 排除急性冠脉综合征 "}]}
    \`\`\``);

    expect(normalizeDiagnosisChecklistItems(parsed)).toEqual([{
      question: '复核胸痛性质',
      recordText: '排除急性冠脉综合征',
    }]);
  });

  it('drops empty items and returns no checklist when review is not needed', () => {
    expect(normalizeDiagnosisChecklistItems({
      isNeeded: true,
      items: [
        { question: '', recordText: '无效' },
        { question: '有效问题', recordText: '' },
      ],
    })).toEqual([{ question: '有效问题', recordText: '' }]);

    expect(normalizeDiagnosisChecklistItems({
      isNeeded: false,
      items: [{ question: '不应出现', recordText: '' }],
    })).toEqual([]);
  });

  it('blocks critical severity and diagnosis mismatch wording', () => {
    expect(buildDiagnosisChecklistMismatchError({
      isNeeded: true,
      severity: 'critical',
      items: [],
    })).toContain('当前诊断与主诉');

    expect(buildDiagnosisChecklistMismatchError({
      isNeeded: true,
      items: [{ question: '当前诊断不能解释高热', recordText: '请复核诊断方向' }],
    })).toBe('当前诊断不能解释高热');

    expect(buildDiagnosisChecklistMismatchError({
      isNeeded: true,
      severity: 'warning',
      items: [{ question: '建议补充询问伴随症状', recordText: '' }],
    })).toBe('');
  });

  it('maps checklist items into standalone-window risk issues', () => {
    expect(buildDiagnosisChecklistRiskIssues({
      isNeeded: true,
      items: [
        { question: '复核诊断', recordText: '肺炎' },
        { question: '排除高危疾病', recordText: '' },
      ],
    }, '当前诊断')).toEqual([
      { issue: '复核诊断', target: '肺炎' },
      { issue: '排除高危疾病', target: '当前诊断' },
    ]);
  });
});
