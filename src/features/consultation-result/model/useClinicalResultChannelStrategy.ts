import type { ComputedRef, MaybeRefOrGetter } from 'vue';
import { computed, toValue } from 'vue';
import type { ClinicalResultChannel } from '@features/clinical-result';

export type { ClinicalResultChannel } from '@features/clinical-result';
export type ClinicalResultUserLogType = 'voice' | 'smart' | 'chronic_refill';

export interface ClinicalResultPreferenceContext {
  consultationId: string;
  sourceModule: string;
  scene: string;
}

export interface ClinicalResultTraceContext {
  scene: string;
  sourceModule: string;
  operationModule: string;
  operationAction: string;
  title: string;
}

interface ClinicalResultChannelProfile {
  userLogType: ClinicalResultUserLogType;
  useVoiceCache: boolean;
  preferenceSourceModule: string;
  preferenceScenePrefix: string;
  diagnosisChecklistTraceContext: ClinicalResultTraceContext;
  cancelDialogTitle: string;
  cancelDialogText: string;
}

const CHANNEL_PROFILES: Record<ClinicalResultChannel, ClinicalResultChannelProfile> = {
  voice: {
    userLogType: 'voice',
    useVoiceCache: true,
    preferenceSourceModule: 'voice_consultation',
    preferenceScenePrefix: 'voice-consultation',
    diagnosisChecklistTraceContext: {
      scene: 'voice-consultation-diagnosis-checklist',
      sourceModule: 'voice_consultation_result',
      operationModule: 'voice_consultation',
      operationAction: 'generate_diagnosis_checklist',
      title: '语音问诊生成鉴别排查建议',
    },
    cancelDialogTitle: '确认放弃当前语音结果？',
    cancelDialogText: '放弃后将清空当前未提交的语音结果，并退回小球状态。',
  },
  symptom: {
    userLogType: 'smart',
    useVoiceCache: false,
    preferenceSourceModule: 'consultation',
    preferenceScenePrefix: 'smart-consultation',
    diagnosisChecklistTraceContext: {
      scene: 'symptom-consultation-diagnosis-checklist',
      sourceModule: 'symptom_consultation_result',
      operationModule: 'consultation',
      operationAction: 'generate_diagnosis_checklist',
      title: '智能问诊生成鉴别排查建议',
    },
    cancelDialogTitle: '确认放弃当前问诊结果？',
    cancelDialogText: '放弃后将清空当前未提交的问诊结果，并退回小球状态。',
  },
  'chronic-refill': {
    userLogType: 'chronic_refill',
    useVoiceCache: false,
    preferenceSourceModule: 'chronic_refill_result',
    preferenceScenePrefix: 'chronic-refill',
    diagnosisChecklistTraceContext: {
      scene: 'chronic-refill-diagnosis-checklist',
      sourceModule: 'chronic_refill_result',
      operationModule: 'chronic_refill',
      operationAction: 'generate_diagnosis_checklist',
      title: '复诊配药生成鉴别排查建议',
    },
    cancelDialogTitle: '确认放弃当前配药结果？',
    cancelDialogText: '放弃后将清空当前未提交的配药结果，并退回小球状态。',
  },
};

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
  diagnosisChecklistTraceContext: ComputedRef<ClinicalResultTraceContext>;
  buildPreferenceContext: (consultationId: string, sceneSuffix: string) => ClinicalResultPreferenceContext;
}

export function resolveClinicalResultChannel(
  channel: ClinicalResultChannel | undefined,
): ClinicalResultChannel {
  if (channel === 'chronic-refill') return 'chronic-refill';
  return channel === 'symptom' ? 'symptom' : 'voice';
}

export function useClinicalResultChannelStrategy(
  input: ClinicalResultChannelStrategyInput,
): ClinicalResultChannelStrategy {
  const resolvedChannel = computed<ClinicalResultChannel>(() => resolveClinicalResultChannel(toValue(input.channel)));
  const profile = computed(() => CHANNEL_PROFILES[resolvedChannel.value]);

  return {
    channel: resolvedChannel,
    userLogType: computed(() => profile.value.userLogType),
    shouldUseVoiceCache: computed(() => profile.value.useVoiceCache),
    shouldShowPatientHeader: computed(() => toValue(input.showPatientHeader) !== false),
    cancelDialogTitle: computed(() => profile.value.cancelDialogTitle),
    cancelDialogText: computed(() => profile.value.cancelDialogText),
    diagnosisChecklistTraceContext: computed(() => profile.value.diagnosisChecklistTraceContext),
    buildPreferenceContext: (consultationId, sceneSuffix) => ({
      consultationId,
      sourceModule: profile.value.preferenceSourceModule,
      scene: `${profile.value.preferenceScenePrefix}-${sceneSuffix}`,
    }),
  };
}
