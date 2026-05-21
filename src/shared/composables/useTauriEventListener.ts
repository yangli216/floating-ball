import { listen, type Event } from '@tauri-apps/api/event';
import { onBeforeUnmount, onMounted } from 'vue';

export type TauriEventUnlisten = () => void;

export interface TauriEventListenerOptions<TPayload> {
  eventName: string;
  handler: (event: Event<TPayload>) => void;
  logContext?: string;
  autoStart?: boolean;
  throwOnError?: boolean;
}

export function useTauriEventListener<TPayload>(options: TauriEventListenerOptions<TPayload>) {
  let unlisten: TauriEventUnlisten | null = null;
  let startPromise: Promise<void> | null = null;
  let startPromiseGeneration: number | null = null;
  let startGeneration = 0;

  function clearListener(): void {
    startGeneration += 1;
    if (unlisten) {
      unlisten();
      unlisten = null;
    }
  }

  function startListener(): Promise<void> {
    if (unlisten) {
      return Promise.resolve();
    }
    if (startPromise && startPromiseGeneration === startGeneration) {
      return startPromise;
    }

    const generation = startGeneration;
    const promise = listen<TPayload>(options.eventName, options.handler)
      .then((nextUnlisten) => {
        if (generation !== startGeneration || startPromise !== promise) {
          nextUnlisten();
          return;
        }
        unlisten = nextUnlisten;
      })
      .catch((error) => {
        const context = options.logContext || options.eventName;
        console.error(`[${context}] Failed to subscribe ${options.eventName}:`, error);
        if (options.throwOnError) {
          throw error;
        }
      })
      .finally(() => {
        if (startPromise === promise) {
          startPromise = null;
          startPromiseGeneration = null;
        }
      });

    startPromise = promise;
    startPromiseGeneration = generation;
    return startPromise;
  }

  onMounted(() => {
    if (options.autoStart === false) {
      return;
    }
    void startListener();
  });

  onBeforeUnmount(clearListener);

  return {
    clearListener,
    startListener,
  };
}

export type TauriEventListener = ReturnType<typeof useTauriEventListener>;
