import type { MaybeRefOrGetter } from 'vue';
import { onMounted, onUnmounted, readonly, shallowRef, toValue } from 'vue';
import {
  loadKeyboardShortcuts,
  resolveKeyboardShortcutAction,
  saveKeyboardShortcuts,
  type KeyboardShortcutAction,
  type KeyboardShortcutBindings,
} from '@features/settings';

interface UseAppKeyboardShortcutsOptions {
  enabled: MaybeRefOrGetter<boolean>;
  actions: Record<KeyboardShortcutAction, () => void | Promise<void>>;
}

export function useAppKeyboardShortcuts(options: UseAppKeyboardShortcutsOptions) {
  const bindings = shallowRef(loadKeyboardShortcuts());
  const runningActions = new Set<KeyboardShortcutAction>();

  async function handleKeydown(event: KeyboardEvent): Promise<void> {
    if (!toValue(options.enabled) || !document.hasFocus()) return;
    const action = resolveKeyboardShortcutAction(event, bindings.value);
    if (!action || runningActions.has(action)) return;
    event.preventDefault();
    event.stopPropagation();
    runningActions.add(action);
    try {
      await options.actions[action]();
    } finally {
      runningActions.delete(action);
    }
  }

  function updateBindings(nextBindings: KeyboardShortcutBindings): void {
    saveKeyboardShortcuts(nextBindings);
    bindings.value = loadKeyboardShortcuts();
  }

  onMounted(() => window.addEventListener('keydown', handleKeydown));
  onUnmounted(() => window.removeEventListener('keydown', handleKeydown));

  return {
    bindings: readonly(bindings),
    updateBindings,
  };
}
