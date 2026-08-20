import { describe, expect, it } from 'vitest';
import {
  buildClinicalRecordFactSuggestionRequest,
  extractExplicitClinicalRecordFacts,
  normalizeClinicalRecordFactSuggestions,
  type ClinicalRecordFactRecord,
} from './clinicalRecordFactConfirmation';
import {
  DEFAULT_PERSONAL_HISTORY_TEMPLATE,
  resolveHistoryRecordTemplate,
} from './historyRecordTemplates';

const emptyRecord: ClinicalRecordFactRecord = {
  chiefComplaint: '',
  historyOfPresentIllness: '',
  pastMedicalHistory: '',
  personalHistory: '',
  familyHistory: '',
  physicalExam: '',
};

describe('clinicalRecordFactConfirmation', () => {
  it('allows clearly marked AI draft content based on record-writing requirements', () => {
    const request = buildClinicalRecordFactSuggestionRequest({
      channel: 'voice',
      patient: {},
      record: emptyRecord,
      diagnoses: [],
      explicitFacts: [],
    });
    const prompt = request.messages.map((item) => item.content).join('\n');

    expect(prompt).toContain('病历书写完整性');
    expect(prompt).toContain('即使输入中没有明确问诊依据，也允许生成');
    expect(prompt).toContain('带 AI 来源标记的可编辑病历草稿');
    expect(prompt).toContain('随所选字段回写');
    expect(prompt).toContain('不得描述成问诊已经明确的事实');
    expect(prompt).toContain('对话中未提及、问诊中未说明、资料中未记录');
    expect(request.config.traceContext?.title).toBe('生成病历候选阴性内容');
  });

  it('only marks negative facts that are already present in the record or structured answers', () => {
    const facts = extractExplicitClinicalRecordFacts({
      ...emptyRecord,
      historyOfPresentIllness: '患者咳嗽2天，否认胸痛、呼吸困难。',
      physicalExam: '查体未闻及干湿啰音。',
    }, ['发热']);

    expect(facts).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'historyOfPresentIllness', text: expect.stringContaining('否认胸痛') }),
      expect.objectContaining({ field: 'historyOfPresentIllness', text: '无发热', source: 'structured-answer' }),
      expect.objectContaining({ field: 'physicalExam', text: expect.stringContaining('未闻及干湿啰音') }),
    ]));
    expect(facts.map((item) => item.text).join(' ')).not.toContain('否认高血压');
  });

  it('keeps standard template clauses out of explicit-fact styling so diagnosis-related items can be checked separately', () => {
    const facts = extractExplicitClinicalRecordFacts({
      ...emptyRecord,
      personalHistory: DEFAULT_PERSONAL_HISTORY_TEMPLATE,
    });

    expect(facts.filter((item) => item.field === 'personalHistory')).toEqual([]);
  });

  it('marks a positive template slot as a context correction', () => {
    const facts = extractExplicitClinicalRecordFacts({
      ...emptyRecord,
      pastMedicalHistory: resolveHistoryRecordTemplate(
        'pastMedicalHistory',
        '既往有高血压病史10年。',
      ),
    });

    expect(facts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        field: 'pastMedicalHistory',
        text: '{有}高血压病史',
        source: 'template-context',
        polarity: 'positive',
      }),
    ]));
    expect(facts).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ text: expect.stringContaining('否认糖尿病') }),
    ]));
  });

  it('keeps AI output pending and removes suggestions that duplicate explicit facts', () => {
    const suggestions = normalizeClinicalRecordFactSuggestions({
      items: [
        {
          field: 'historyOfPresentIllness',
          question: '是否伴胸痛？',
          negativeRecordText: '否认胸痛',
          rationale: '排除高风险胸痛',
          priority: 'critical',
        },
        {
          field: 'pastMedicalHistory',
          question: '是否有高血压病史？',
          negativeRecordText: '否认高血压病史',
          rationale: '完善既往史',
          priority: 'general',
        },
      ],
    }, [{
      id: 'explicit-1',
      field: 'historyOfPresentIllness',
      text: '否认胸痛',
      source: 'record-explicit',
      polarity: 'negative',
    }]);

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({
      field: 'pastMedicalHistory',
      priority: 'general',
      status: 'pending',
    });
  });

  it('removes a candidate already covered by a grouped explicit negative', () => {
    const suggestions = normalizeClinicalRecordFactSuggestions({
      items: [{
        field: 'historyOfPresentIllness',
        question: '是否伴流涕？',
        negativeRecordText: '无流涕',
        rationale: '核查伴随症状',
        priority: 'general',
      }],
    }, [{
      id: 'explicit-grouped-negative',
      field: 'historyOfPresentIllness',
      text: '无鼻塞、流涕',
      source: 'record-explicit',
      polarity: 'negative',
    }]);

    expect(suggestions).toEqual([]);
  });

  it('drops a workflow placeholder before it can be included in the record', () => {
    const suggestions = normalizeClinicalRecordFactSuggestions({
      items: [{
        field: 'pastMedicalHistory',
        question: '既往史是否完整？',
        negativeRecordText: '待医生补充完善',
        rationale: '完善病历',
        priority: 'general',
      }],
    });

    expect(suggestions).toEqual([]);
  });

  it('drops a source-oriented missing-information candidate before merging it into the record', () => {
    const suggestions = normalizeClinicalRecordFactSuggestions({
      items: [{
        field: 'historyOfPresentIllness',
        question: '近期是否有新发不适或病情变化？',
        negativeRecordText: '对话中未提及新发不适症状或病情变化',
        rationale: '补充本次复诊情况',
        priority: 'critical',
      }],
    });

    expect(suggestions).toEqual([]);
  });

  it('marks structured positive symptoms only when they are present outside negative clauses', () => {
    const facts = extractExplicitClinicalRecordFacts({
      ...emptyRecord,
      historyOfPresentIllness: '患者发热、咽痛1天，否认咳嗽。',
    }, [], ['发热', '咽痛', '咳嗽']);

    expect(facts).toEqual(expect.arrayContaining([
      expect.objectContaining({ text: '发热', polarity: 'positive', source: 'structured-answer' }),
      expect.objectContaining({ text: '咽痛', polarity: 'positive', source: 'structured-answer' }),
    ]));
    expect(facts).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ text: '咳嗽', polarity: 'positive' }),
    ]));
  });

});
