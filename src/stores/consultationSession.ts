import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { AppPatient } from '../types/appState';
import type { DiagnosisPathPayload } from '../services/diagnosisPath';

export type SessionCardKind =
  | 'session'
  | 'record'
  | 'diagnosis'
  | 'differential'
  | 'medication'
  | 'examination'
  | 'reminder';

export interface SessionOption {
  id: string;
  title: string;
  description: string;
  code?: string;
  meta?: string;
  caption?: string;
  matched?: boolean;
  selected?: boolean;
}

export interface SessionCard {
  id: string;
  kind: SessionCardKind;
  badge: string;
  title: string;
  source: string;
  summary: string;
  status: string;
  statusTone?: 'default' | 'accent' | 'warn';
  details: string[];
  options?: SessionOption[];
  applied?: boolean;
  expanded?: boolean;
  createdAt: string;
}

export interface ConsultationSessionDraft {
  chiefComplaint: string;
  historyOfPresentIllness: string;
  diagnoses: Array<{
    code?: string;
    name: string;
    rationale?: string;
    rate?: string;
  }>;
  medications: Array<{
    name: string;
    usage?: string;
    reason?: string;
  }>;
  examinations: Array<{
    name: string;
    reason?: string;
  }>;
  reminders: Array<{
    level: 'urgent' | 'normal';
    content: string;
  }>;
}

interface DiagnosisPathCacheEntry {
  sessionKey: string;
  targetKey: string;
  candidateSignature: string;
  payload: DiagnosisPathPayload;
  cachedAt: string;
}

function emptyDraft(): ConsultationSessionDraft {
  return {
    chiefComplaint: '',
    historyOfPresentIllness: '',
    diagnoses: [],
    medications: [],
    examinations: [],
    reminders: [],
  };
}

function normalizeDiagnosisPathKeyPart(value: unknown): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export const useConsultationSessionStore = defineStore('consultationSession', () => {
  const sessionId = ref('');
  const patient = ref<AppPatient | null>(null);
  const cards = ref<SessionCard[]>([]);
  const draft = ref<ConsultationSessionDraft>(emptyDraft());
  const cardSeed = ref(0);
  const diagnosisPathCache = ref<Record<string, DiagnosisPathCacheEntry>>({});

  const hasActiveSession = computed(() => !!patient.value && !!sessionId.value);

  function createSessionId(targetPatient: AppPatient): string {
    const baseId = String(
      targetPatient.idPi || targetPatient.patientId || targetPatient.id || Date.now()
    );
    const now = new Date();
    const stamp = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
      String(now.getHours()).padStart(2, '0'),
      String(now.getMinutes()).padStart(2, '0'),
    ].join('');
    return `session-${baseId}-${stamp}`;
  }

  function formatTime(date = new Date()): string {
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function startSession(targetPatient: AppPatient): void {
    const nextId = String(targetPatient.idPi || targetPatient.patientId || targetPatient.id || '');
    const currentId = String(patient.value?.idPi || patient.value?.patientId || patient.value?.id || '');

    if (hasActiveSession.value && nextId !== '' && nextId === currentId) {
      patient.value = {
        ...(patient.value || {}),
        ...targetPatient,
      };
      return;
    }

    sessionId.value = createSessionId(targetPatient);
    patient.value = targetPatient;
    cards.value = [];
    draft.value = emptyDraft();
    cardSeed.value = 0;
    clearDiagnosisPathCache();
  }

  function clearSession(): void {
    sessionId.value = '';
    patient.value = null;
    cards.value = [];
    draft.value = emptyDraft();
    cardSeed.value = 0;
    clearDiagnosisPathCache();
  }

  function nextCardId(): string {
    cardSeed.value += 1;
    return `consultation-session-card-${cardSeed.value}`;
  }

  function appendCard(partial: Omit<SessionCard, 'id' | 'createdAt' | 'expanded'>): SessionCard {
    cards.value = cards.value.map((card) => ({ ...card, expanded: false }));
    const card: SessionCard = {
      id: nextCardId(),
      createdAt: formatTime(),
      expanded: true,
      applied: false,
      ...partial,
    };
    cards.value.push(card);
    return card;
  }

  function replaceCard(cardId: string, patch: Partial<SessionCard>): void {
    cards.value = cards.value.map((card) => (card.id === cardId ? { ...card, ...patch } : card));
  }

  function toggleCard(cardId: string): void {
    cards.value = cards.value.map((card) =>
      card.id === cardId ? { ...card, expanded: !card.expanded } : card
    );
  }

  function setCardOptions(cardId: string, options: SessionOption[]): void {
    replaceCard(cardId, { options });
  }

  function selectCardOption(cardId: string, optionId: string): void {
    cards.value = cards.value.map((card) => {
      if (card.id !== cardId || !card.options) {
        return card;
      }

      if (card.kind === 'medication' || card.kind === 'examination') {
        return {
          ...card,
          options: card.options.map((option) => ({
            ...option,
            selected: option.id === optionId ? !option.selected : option.selected,
          })),
        };
      }

      return {
        ...card,
        options: card.options.map((option) => ({
          ...option,
          selected: option.id === optionId,
        })),
      };
    });
  }

  function getSelectedOption(cardId: string): SessionOption | null {
    const card = cards.value.find((item) => item.id === cardId);
    return card?.options?.find((option) => option.selected) || null;
  }

  function getLatestSelectedDiagnosis(): SessionOption | null {
    const diagnosisCard = [...cards.value].reverse().find((card) => card.kind === 'diagnosis' && card.options?.length);
    return diagnosisCard?.options?.find((option) => option.selected) || null;
  }

  function markCardReviewed(cardId: string): void {
    replaceCard(cardId, {
      status: '医生已查看',
      statusTone: 'default',
    });
  }

  function applyCardToDraft(cardId: string): boolean {
    const card = cards.value.find((item) => item.id === cardId);
    if (!card) {
      return false;
    }

    let didApply = false;

    switch (card.kind) {
      case 'record': {
        const chief = card.details.find((item) => item.startsWith('主诉建议：'))?.replace('主诉建议：', '').trim();
        const hpi = card.details.find((item) => item.startsWith('现病史摘要：'))?.replace('现病史摘要：', '').trim();
        if (chief) {
          draft.value.chiefComplaint = chief;
        }
        if (hpi) {
          draft.value.historyOfPresentIllness = hpi;
        }
        didApply = Boolean(chief || hpi);
        break;
      }
      case 'diagnosis': {
        const selected = card.options?.find((option) => option.selected);
        if (selected) {
          draft.value.diagnoses = [{
            code: selected.code,
            name: selected.title,
            rationale: selected.description,
            rate: selected.meta,
          }];
          didApply = true;
        }
        break;
      }
      case 'medication': {
        draft.value.medications = (card.options || [])
          .filter((option) => option.selected)
          .map((option) => ({
            name: option.title,
            usage: option.meta,
            reason: option.description,
          }));
        didApply = draft.value.medications.length > 0;
        break;
      }
      case 'examination': {
        draft.value.examinations = (card.options || [])
          .filter((option) => option.selected)
          .map((option) => ({
            name: option.title,
            reason: option.description,
          }));
        didApply = draft.value.examinations.length > 0;
        break;
      }
      case 'reminder': {
        draft.value.reminders = card.details.map((detail) => ({
          level: detail.startsWith('紧急：') ? 'urgent' : 'normal',
          content: detail.replace(/^紧急：|^普通：/, '').trim(),
        }));
        didApply = draft.value.reminders.length > 0;
        break;
      }
      default:
        break;
    }

    if (!didApply) {
      return false;
    }

    replaceCard(cardId, {
      applied: true,
      status: '医生已采纳为草稿',
      statusTone: 'accent',
    });
    return true;
  }

  function resolveDiagnosisPathSessionKey(source?: Record<string, unknown> | null): string {
    const sourceId = normalizeDiagnosisPathKeyPart(
      source?.idPi || source?.patientId || source?.id
    );
    const sessionKey = normalizeDiagnosisPathKeyPart(sessionId.value);
    if (sessionKey && (!sourceId || sessionId.value.startsWith(`session-${sourceId}-`))) {
      return `session:${sessionKey}`;
    }

    if (sourceId) {
      return `patient:${sourceId}`;
    }

    const fallbackParts = [
      normalizeDiagnosisPathKeyPart(source?.naPi || source?.name),
      normalizeDiagnosisPathKeyPart(source?.birthday),
      normalizeDiagnosisPathKeyPart(source?.ageText),
      normalizeDiagnosisPathKeyPart(source?.sdSexText || source?.gender),
    ].filter(Boolean);

    return fallbackParts.length > 0 ? `patient:${fallbackParts.join('|')}` : 'session:anonymous';
  }

  function resolveDiagnosisPathTargetKey(
    option?: Pick<SessionOption, 'title' | 'code' | 'description' | 'meta'> | null
  ): string {
    if (!option) {
      return 'target:unknown';
    }

    const code = normalizeDiagnosisPathKeyPart(option.code);
    const title = normalizeDiagnosisPathKeyPart(option.title);
    const description = normalizeDiagnosisPathKeyPart(option.description);
    const primary = code || title || description || 'target';

    return [primary, title && title !== primary ? title : ''].filter(Boolean).join('|');
  }

  function resolveDiagnosisPathCandidateSignature(options: SessionOption[]): string {
    return options
      .map((option) =>
        [
          normalizeDiagnosisPathKeyPart(option.code),
          normalizeDiagnosisPathKeyPart(option.title),
          normalizeDiagnosisPathKeyPart(option.description),
          normalizeDiagnosisPathKeyPart(option.meta),
          normalizeDiagnosisPathKeyPart(option.caption),
          option.matched ? '1' : '0',
        ].join('::')
      )
      .sort()
      .join('||');
  }

  function buildDiagnosisPathCacheKey(sessionKey: string, targetKey: string): string {
    return `${normalizeDiagnosisPathKeyPart(sessionKey)}::${normalizeDiagnosisPathKeyPart(targetKey)}`;
  }

  function getDiagnosisPathCache(
    sessionKey: string,
    targetKey: string,
    candidateSignature: string
  ): DiagnosisPathPayload | null {
    const cacheKey = buildDiagnosisPathCacheKey(sessionKey, targetKey);
    const entry = diagnosisPathCache.value[cacheKey];

    if (!entry || entry.candidateSignature !== candidateSignature) {
      return null;
    }

    return entry.payload;
  }

  function setDiagnosisPathCache(
    sessionKey: string,
    targetKey: string,
    candidateSignature: string,
    payload: DiagnosisPathPayload
  ): void {
    const cacheKey = buildDiagnosisPathCacheKey(sessionKey, targetKey);
    diagnosisPathCache.value = {
      ...diagnosisPathCache.value,
      [cacheKey]: {
        sessionKey,
        targetKey,
        candidateSignature,
        payload,
        cachedAt: new Date().toISOString(),
      },
    };
  }

  function clearDiagnosisPathCache(): void {
    diagnosisPathCache.value = {};
  }

  return {
    sessionId,
    patient,
    cards,
    draft,
    diagnosisPathCache,
    hasActiveSession,
    startSession,
    clearSession,
    appendCard,
    replaceCard,
    toggleCard,
    setCardOptions,
    selectCardOption,
    getSelectedOption,
    getLatestSelectedDiagnosis,
    markCardReviewed,
    applyCardToDraft,
    resolveDiagnosisPathSessionKey,
    resolveDiagnosisPathTargetKey,
    resolveDiagnosisPathCandidateSignature,
    getDiagnosisPathCache,
    setDiagnosisPathCache,
    clearDiagnosisPathCache,
  };
});
