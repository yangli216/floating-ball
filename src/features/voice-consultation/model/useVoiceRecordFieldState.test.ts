// @vitest-environment jsdom

import { ref } from 'vue';
import { describe, expect, it } from 'vitest';
import { useVoiceRecordFieldState } from './useVoiceRecordFieldState';

function createFields() {
  return {
    chiefComplaint: ref('发热1天'),
    historyOfPresentIllness: ref('患者发热1天。'),
    pastMedicalHistory: ref(''),
    personalHistory: ref(''),
    familyHistory: ref(''),
    physicalExam: ref(''),
    precautions: ref('注意休息。'),
  };
}

describe('useVoiceRecordFieldState', () => {
  it('tracks doctor edits without creating field feedback state', () => {
    const fields = createFields();
    const state = useVoiceRecordFieldState({ fields });
    state.setInitialRecordSnapshot({
      chiefComplaint: fields.chiefComplaint.value,
      historyOfPresentIllness: fields.historyOfPresentIllness.value,
      precautions: fields.precautions.value,
    });

    expect(state.isRecordFieldModified('historyOfPresentIllness')).toBe(false);
    fields.historyOfPresentIllness.value = '患者发热1天，伴咽痛。';
    expect(state.isRecordFieldModified('historyOfPresentIllness')).toBe(true);

    state.setInitialRecordFieldValue('precautions', '根据已选诊断注意休息。');
    fields.precautions.value = '根据已选诊断注意休息。';
    expect(state.isRecordFieldModified('precautions')).toBe(false);
    expect(state).not.toHaveProperty('getRecordFieldFeedbackKey');
    expect(state).not.toHaveProperty('getRecordFieldDraft');
  });
});
