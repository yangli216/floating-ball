import { computed, ref } from 'vue';
import { trackClick } from '@/services/operationTracker';
import { evaluateRigidSafetyRules, type RigidBlockAlert } from '@/services/safetyRules';
import type { GeneratedRecord, PatientInfo } from '@/types/voiceResult';

/**
 * L1 刚性阻断 composable
 *
 * 与 useVoiceSafetyReview（L2 LLM 柔性提醒）并行存在：
 * - 本层为同步、确定性、无网络判断
 * - 任何 severity === 'block' 的告警必须经过医生二次确认才能提交
 * - acknowledged 状态仅作用于本次会话，重新加载病例会重新计算
 */
export function useVoiceRigidBlock() {
  const alerts = ref<RigidBlockAlert[]>([]);
  const acknowledgedIds = ref<Set<string>>(new Set());
  const lastEvaluatedAt = ref<number | null>(null);

  const blockingAlerts = computed(() => alerts.value.filter(a => a.severity === 'block'));
  const warnAlerts = computed(() => alerts.value.filter(a => a.severity === 'warn'));
  const unacknowledgedBlocks = computed(() => blockingAlerts.value.filter(a => !acknowledgedIds.value.has(a.id)));
  const hasBlocks = computed(() => blockingAlerts.value.length > 0);
  const requiresConfirmation = computed(() => unacknowledgedBlocks.value.length > 0);

  function evaluate(record: GeneratedRecord | null | undefined, patient?: PatientInfo | null): RigidBlockAlert[] {
    const next = evaluateRigidSafetyRules(record, patient);
    // 重新评估时清掉已不再触发的 acknowledge 状态，避免长期残留
    const nextIds = new Set(next.map(a => a.id));
    const trimmed = new Set<string>();
    acknowledgedIds.value.forEach(id => { if (nextIds.has(id)) trimmed.add(id); });
    acknowledgedIds.value = trimmed;
    alerts.value = next;
    lastEvaluatedAt.value = Date.now();
    if (next.length > 0) {
      trackClick('voice_rigid_block_evaluated', {
        total: next.length,
        block: next.filter(a => a.severity === 'block').length,
        warn: next.filter(a => a.severity === 'warn').length,
        categories: Array.from(new Set(next.map(a => a.category))),
      });
    }
    return next;
  }

  function acknowledge(alertId: string): void {
    if (!alerts.value.some(a => a.id === alertId)) return;
    acknowledgedIds.value = new Set([...acknowledgedIds.value, alertId]);
    trackClick('voice_rigid_block_acknowledged', { alertId });
  }

  function acknowledgeAllBlocks(): void {
    const ids = blockingAlerts.value.map(a => a.id);
    if (ids.length === 0) return;
    acknowledgedIds.value = new Set([...acknowledgedIds.value, ...ids]);
    trackClick('voice_rigid_block_bulk_acknowledged', { count: ids.length });
  }

  function reset(): void {
    alerts.value = [];
    acknowledgedIds.value = new Set();
    lastEvaluatedAt.value = null;
  }

  return {
    alerts,
    blockingAlerts,
    warnAlerts,
    unacknowledgedBlocks,
    hasBlocks,
    requiresConfirmation,
    lastEvaluatedAt,
    isAcknowledged: (id: string) => acknowledgedIds.value.has(id),
    evaluate,
    acknowledge,
    acknowledgeAllBlocks,
    reset,
  };
}

export type UseVoiceRigidBlockReturn = ReturnType<typeof useVoiceRigidBlock>;
