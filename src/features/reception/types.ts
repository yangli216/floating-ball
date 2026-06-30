import type { HisOutpatientFollowUpContext, HisVisitRecord } from '@/services/his/types';
import type { ChronicRefillCandidate } from '@features/reception-risk';

export type ReceptionOpportunity =
  | {
      type: 'chronic-refill';
      candidate: ChronicRefillCandidate;
    }
  | {
      type: 'report-follow-up';
      context: HisOutpatientFollowUpContext;
    }
  | {
      type: 'report-interpretation';
      visits: HisVisitRecord[];
    };

export type ReceptionOpportunityType = ReceptionOpportunity['type'];

export type OutpatientVoiceEntryDecision =
  | { type: 'restore-voice-result' }
  | { type: 'report-follow-up'; context: HisOutpatientFollowUpContext }
  | { type: 'voice-capture' };
