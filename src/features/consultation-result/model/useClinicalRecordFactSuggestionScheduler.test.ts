import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectScope, ref } from 'vue';
import { useClinicalRecordFactSuggestionScheduler } from './useClinicalRecordFactSuggestionScheduler';

afterEach(() => {
  vi.useRealTimers();
});

function createScheduler(options: {
  initiallyAllowed?: boolean;
  initiallyBlocked?: boolean;
  initialSuggestionCount?: number;
} = {}) {
  const allowed = ref(options.initiallyAllowed ?? true);
  const blocked = ref(options.initiallyBlocked ?? false);
  const suggestionCount = ref(options.initialSuggestionCount ?? 0);
  const generate = vi.fn(async (): Promise<void> => undefined);
  const scope = effectScope();
  const scheduler = scope.run(() => useClinicalRecordFactSuggestionScheduler({
    isAllowed: () => allowed.value,
    isBlocked: () => blocked.value,
    getSuggestionCount: () => suggestionCount.value,
    generate,
    delayMs: 350,
  }))!;
  return { allowed, blocked, generate, scheduler, scope, suggestionCount };
}

describe('useClinicalRecordFactSuggestionScheduler', () => {
  it('keeps a request pending through finalizing and runs once after the result stabilizes', async () => {
    vi.useFakeTimers();
    const { blocked, generate, scheduler, scope } = createScheduler({ initiallyBlocked: true });

    scheduler.schedule();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(generate).not.toHaveBeenCalled();
    expect(scheduler.pending.value).toBe(true);

    blocked.value = false;
    await vi.advanceTimersByTimeAsync(349);
    expect(generate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(generate).toHaveBeenCalledTimes(1);

    scope.stop();
  });

  it('does not duplicate a scheduled or running generation', async () => {
    vi.useFakeTimers();
    let resolveGeneration: (() => void) | undefined;
    const generation = new Promise<void>((resolve) => { resolveGeneration = resolve; });
    const { generate, scheduler, scope } = createScheduler();
    generate.mockImplementation(() => generation);

    scheduler.schedule();
    scheduler.schedule();
    await vi.advanceTimersByTimeAsync(350);
    expect(generate).toHaveBeenCalledTimes(1);

    scheduler.schedule();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(generate).toHaveBeenCalledTimes(1);

    resolveGeneration?.();
    await generation;
    scope.stop();
  });

  it('cancels pending work when the channel becomes disallowed or the result resets', async () => {
    vi.useFakeTimers();
    const { allowed, blocked, generate, scheduler, scope } = createScheduler({ initiallyBlocked: true });

    scheduler.schedule();
    allowed.value = false;
    blocked.value = false;
    await vi.advanceTimersByTimeAsync(1_000);
    expect(generate).not.toHaveBeenCalled();
    expect(scheduler.pending.value).toBe(false);

    allowed.value = true;
    scheduler.schedule();
    scheduler.reset();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(generate).not.toHaveBeenCalled();

    scope.stop();
  });

  it('does not request another generation when suggestions already exist', async () => {
    vi.useFakeTimers();
    const { generate, scheduler, scope, suggestionCount } = createScheduler();

    suggestionCount.value = 1;
    scheduler.schedule();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(generate).not.toHaveBeenCalled();

    scope.stop();
  });
});
