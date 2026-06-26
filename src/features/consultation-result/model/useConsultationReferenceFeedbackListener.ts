import { useTauriEventListener } from '@shared/composables/useTauriEventListener';

export const CONSULTATION_REFERENCE_FEEDBACK_EVENT = 'consultation-reference-feedback';

export interface ConsultationReferenceFeedbackPayloadBase {
  consultationId?: string;
}

export interface ConsultationReferenceFeedbackListenerOptions<
  TPayload extends ConsultationReferenceFeedbackPayloadBase,
> {
  resolveConsultationId: () => string;
  isActive?: () => boolean;
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
      if (options.isActive && !options.isActive()) {
        return;
      }
      const payload = event.payload;
      const expectedConsultationId = options.resolveConsultationId();
      if (
        payload.consultationId &&
        payload.consultationId !== expectedConsultationId
      ) {
        console.warn(`[${options.logContext || 'ConsultationReferenceFeedback'}] Ignore reference feedback for another consultation`, {
          expectedConsultationId,
          actualConsultationId: payload.consultationId,
        });
        return;
      }
      options.onFeedback(payload);
    },
  });
}

export type ConsultationReferenceFeedbackListener = ReturnType<
  typeof useConsultationReferenceFeedbackListener
>;
