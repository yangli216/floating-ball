import type { EventCallback, EventName, UnlistenFn } from '@tauri-apps/api/event';
import type { Window } from '@tauri-apps/api/window';
import { onBeforeUnmount } from 'vue';

export interface TauriWindowEventListenerSpec<TPayload = unknown> {
  eventName: EventName;
  handler: EventCallback<TPayload>;
}

export interface TauriWindowEventListenersOptions {
  window: Window;
  listeners: TauriWindowEventListenerSpec[];
  logContext?: string;
}

export function useTauriWindowEventListeners(options: TauriWindowEventListenersOptions) {
  let unlisteners: UnlistenFn[] = [];
  let registerPromise: Promise<void> | null = null;

  function clearListeners(): void {
    unlisteners.forEach((unlisten) => unlisten());
    unlisteners = [];
  }

  function registerListeners(): Promise<void> {
    if (unlisteners.length > 0) {
      return Promise.resolve();
    }
    if (registerPromise) {
      return registerPromise;
    }

    const nextUnlisteners: UnlistenFn[] = [];
    registerPromise = (async () => {
      try {
        for (const listener of options.listeners) {
          nextUnlisteners.push(
            await options.window.listen(listener.eventName, listener.handler)
          );
        }
        unlisteners = nextUnlisteners;
      } catch (error) {
        nextUnlisteners.forEach((unlisten) => unlisten());
        clearListeners();
        const context = options.logContext || options.window.label;
        console.error(`[${context}] Failed to register window event listeners:`, error);
        throw error;
      } finally {
        registerPromise = null;
      }
    })();

    return registerPromise;
  }

  onBeforeUnmount(clearListeners);

  return {
    clearListeners,
    registerListeners,
  };
}

export type TauriWindowEventListeners = ReturnType<typeof useTauriWindowEventListeners>;
