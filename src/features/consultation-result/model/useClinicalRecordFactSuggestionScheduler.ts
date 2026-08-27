import { computed, onScopeDispose, ref, watch } from 'vue';

export interface ClinicalRecordFactSuggestionSchedulerOptions {
  isAllowed: () => boolean;
  isBlocked: () => boolean;
  getSuggestionCount: () => number;
  generate: () => Promise<void>;
  delayMs?: number;
}

/**
 * Schedules the generic record fact suggestion request after the result is stable.
 * A blocked request remains pending instead of being dropped by a one-shot timer.
 */
export function useClinicalRecordFactSuggestionScheduler(
  options: ClinicalRecordFactSuggestionSchedulerOptions,
) {
  const pending = ref(false);
  const running = ref(false);
  const allowed = computed(() => options.isAllowed());
  const blocked = computed(() => options.isBlocked());
  const suggestionCount = computed(() => options.getSuggestionCount());
  const delayMs = Math.max(0, options.delayMs ?? 350);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let resetVersion = 0;

  function clearTimer(): void {
    if (!timer) return;
    clearTimeout(timer);
    timer = null;
  }

  function run(): void {
    if (
      !pending.value
      || running.value
      || !allowed.value
      || blocked.value
      || suggestionCount.value > 0
    ) {
      reconcile();
      return;
    }

    const currentVersion = resetVersion;
    pending.value = false;
    running.value = true;
    const task = options.generate();
    void task.catch(() => undefined).finally(() => {
      if (currentVersion !== resetVersion) return;
      running.value = false;
      reconcile();
    });
  }

  function reconcile(): void {
    if (!allowed.value || suggestionCount.value > 0) {
      pending.value = false;
      clearTimer();
      return;
    }
    if (!pending.value || running.value || blocked.value) {
      clearTimer();
      return;
    }
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      run();
    }, delayMs);
  }

  function schedule(): void {
    if (!allowed.value || suggestionCount.value > 0 || running.value) return;
    pending.value = true;
    reconcile();
  }

  function reset(): void {
    resetVersion += 1;
    pending.value = false;
    running.value = false;
    clearTimer();
  }

  watch([allowed, blocked, suggestionCount], reconcile, { flush: 'sync' });
  onScopeDispose(reset);

  return {
    pending,
    running,
    reset,
    schedule,
  };
}

export type ClinicalRecordFactSuggestionScheduler = ReturnType<
  typeof useClinicalRecordFactSuggestionScheduler
>;
