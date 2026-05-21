import { useTauriEventListener } from '@shared/composables/useTauriEventListener';

export const CONSULTATION_REFERENCE_FEEDBACK_EVENT = 'consultation-reference-feedback';

export interface ConsultationReferenceFeedbackPayloadBase {
  consultationId?: string;
}

export interface ConsultationReferenceFeedbackListenerOptions<
  TPayload extends ConsultationReferenceFeedbackPayloadBase,
> {
  resolveConsultationId: () => string;
  onFeedback: (payload: TPayload) => void;
  logContext?: string;
}

export function useConsultationReferenceFeedbackListener<
  TPayload extends ConsultationReferenceFeedbackPayloadBase,
>(options: ConsultationReferenceFeedbackListenerOptions<TPayload>) {
  return useTauriEventListener<TPayload>({
    eventName: CONSULTATION_REFERENCE_FEEDBACK_EVENT,
    logContext: options.logContext,
    handler: (event) => {
      const payload = event.payload;
      if (
        payload.consultationId &&
        payload.consultationId !== options.resolveConsultationId()
      ) {
        return;
      }
      options.onFeedback(payload);
    },
  });
}

export type ConsultationReferenceFeedbackListener = ReturnType<
  typeof useConsultationReferenceFeedbackListener
>;
