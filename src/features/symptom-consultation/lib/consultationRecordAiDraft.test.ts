import { describe, expect, it } from 'vitest';
import { normalizeConsultationRecordAiDraftOutput } from './consultationRecordAiDraft';

describe('normalizeConsultationRecordAiDraftOutput', () => {
  it('keeps clinical facts and removes process prompts before the result editor', () => {
    expect(normalizeConsultationRecordAiDraftOutput({
      chiefComplaint: '咳嗽3天',
      historyOfPresentIllness: '患者咳嗽3天，其他情况待医生补充完善。否认胸痛。否认胸痛。',
    })).toEqual({
      chiefComplaint: '咳嗽3天',
      historyOfPresentIllness: '患者咳嗽3天。否认胸痛。',
    });
  });

  it('rejects a draft whose required field only contains a process prompt', () => {
    expect(() => normalizeConsultationRecordAiDraftOutput({
      chiefComplaint: '待医生补充完善',
      historyOfPresentIllness: '患者咳嗽3天。',
    })).toThrow('AI 病历草稿缺少主诉或现病史');
  });
});
