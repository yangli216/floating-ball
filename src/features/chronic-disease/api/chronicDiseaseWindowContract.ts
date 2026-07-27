import type { TcdVisitForm } from '../types';

export const MAIN_WINDOW_LABEL = 'main';
export const CHRONIC_DISEASE_WINDOW_LABEL = 'chronic-disease-window';
export const CHRONIC_DISEASE_SAVE_REQUEST_EVENT = 'chronic-disease:save-tcd-form-request';
export const CHRONIC_DISEASE_SAVE_RESULT_EVENT = 'chronic-disease:save-tcd-form-result';

export interface ChronicDiseaseSaveRequest {
  requestId: string;
  form: TcdVisitForm;
}

export type ChronicDiseaseSaveResult =
  | {
      requestId: string;
      ok: true;
      data?: unknown;
    }
  | {
      requestId: string;
      ok: false;
      error: string;
    };
