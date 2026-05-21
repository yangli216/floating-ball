import type { ComputedRef, MaybeRefOrGetter } from 'vue';
import { computed, toValue } from 'vue';

export type ClinicalResultChannel = 'voice' | 'symptom';
export type ClinicalResultUserLogType = 'voice' | 'smart';

export interface ClinicalResultChannelStrategyInput {
  channel: MaybeRefOrGetter<ClinicalResultChannel | undefined>;
  showPatientHeader?: MaybeRefOrGetter<boolean | undefined>;
}

export interface ClinicalResultChannelStrategy {
  channel: ComputedRef<ClinicalResultChannel>;
  userLogType: ComputedRef<ClinicalResultUserLogType>;
  shouldUseVoiceCache: ComputedRef<boolean>;
  shouldShowPatientHeader: ComputedRef<boolean>;
  cancelDialogTitle: ComputedRef<string>;
  cancelDialogText: ComputedRef<string>;
}

export function resolveClinicalResultChannel(
  channel: ClinicalResultChannel | undefined,
): ClinicalResultChannel {
  return channel === 'symptom' ? 'symptom' : 'voice';
}

export function useClinicalResultChannelStrategy(
  input: ClinicalResultChannelStrategyInput,
): ClinicalResultChannelStrategy {
  const resolvedChannel = computed<ClinicalResultChannel>(() => resolveClinicalResultChannel(toValue(input.channel)));
  const shouldUseVoiceCache = computed(() => resolvedChannel.value === 'voice');

  return {
    channel: resolvedChannel,
    userLogType: computed(() => resolvedChannel.value === 'voice' ? 'voice' : 'smart'),
    shouldUseVoiceCache,
    shouldShowPatientHeader: computed(() => toValue(input.showPatientHeader) !== false),
    cancelDialogTitle: computed(() => shouldUseVoiceCache.value ? '确认放弃当前语音结果？' : '确认放弃当前问诊结果？'),
    cancelDialogText: computed(() => shouldUseVoiceCache.value
      ? '放弃后将清空当前未提交的语音结果，并退回小球状态。'
      : '放弃后将清空当前未提交的问诊结果，并退回小球状态。'),
  };
}
