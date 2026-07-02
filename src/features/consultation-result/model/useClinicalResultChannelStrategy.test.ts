import { ref } from 'vue';
import { describe, expect, it } from 'vitest';
import {
  resolveClinicalResultChannel,
  useClinicalResultChannelStrategy,
} from './useClinicalResultChannelStrategy';
import type { ClinicalResultChannel } from '@features/clinical-result';

describe('useClinicalResultChannelStrategy', () => {
  it.each<{
    input: ClinicalResultChannel | undefined;
    expected: ClinicalResultChannel;
  }>([
    { input: undefined, expected: 'voice' },
    { input: 'voice', expected: 'voice' },
    { input: 'symptom', expected: 'symptom' },
    { input: 'chronic-refill', expected: 'chronic-refill' },
  ])('resolves $input to $expected', ({ input, expected }) => {
    expect(resolveClinicalResultChannel(input)).toBe(expected);
  });

  it('keeps every channel-specific derivation in one reactive strategy', () => {
    const channel = ref<ClinicalResultChannel | undefined>('voice');
    const showPatientHeader = ref(true);
    const strategy = useClinicalResultChannelStrategy({ channel, showPatientHeader });

    expect(strategy.channel.value).toBe('voice');
    expect(strategy.userLogType.value).toBe('voice');
    expect(strategy.shouldUseVoiceCache.value).toBe(true);
    expect(strategy.shouldShowPatientHeader.value).toBe(true);
    expect(strategy.cancelDialogTitle.value).toContain('语音结果');
    expect(strategy.buildPreferenceContext('consultation-1', 'writeback')).toEqual({
      consultationId: 'consultation-1',
      sourceModule: 'voice_consultation',
      scene: 'voice-consultation-writeback',
    });
    expect(strategy.diagnosisChecklistTraceContext.value).toMatchObject({
      scene: 'voice-consultation-diagnosis-checklist',
      operationModule: 'voice_consultation',
    });

    channel.value = 'symptom';
    showPatientHeader.value = false;

    expect(strategy.userLogType.value).toBe('smart');
    expect(strategy.shouldUseVoiceCache.value).toBe(false);
    expect(strategy.shouldShowPatientHeader.value).toBe(false);
    expect(strategy.cancelDialogTitle.value).toContain('问诊结果');
    expect(strategy.buildPreferenceContext('consultation-2', 'diagnosis')).toEqual({
      consultationId: 'consultation-2',
      sourceModule: 'consultation',
      scene: 'smart-consultation-diagnosis',
    });
    expect(strategy.diagnosisChecklistTraceContext.value).toMatchObject({
      scene: 'symptom-consultation-diagnosis-checklist',
      sourceModule: 'symptom_consultation_result',
    });
  });

  it('uses dedicated chronic-refill tracking metadata without enabling voice cache', () => {
    const strategy = useClinicalResultChannelStrategy({ channel: 'chronic-refill' });

    expect(strategy.userLogType.value).toBe('smart');
    expect(strategy.shouldUseVoiceCache.value).toBe(false);
    expect(strategy.cancelDialogTitle.value).toContain('配药结果');
    expect(strategy.buildPreferenceContext('consultation-3', 'writeback')).toEqual({
      consultationId: 'consultation-3',
      sourceModule: 'chronic_refill_result',
      scene: 'chronic-refill-writeback',
    });
    expect(strategy.diagnosisChecklistTraceContext.value).toMatchObject({
      scene: 'chronic-refill-diagnosis-checklist',
      operationModule: 'chronic_refill',
    });
  });
});
