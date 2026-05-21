import { onBeforeUnmount, onMounted, toValue } from 'vue';
import type { MaybeRefOrGetter, Ref } from 'vue';

type DocumentEventName = 'click' | 'pointerdown' | 'mousedown' | 'mouseup';

export interface OutsideInteractionTarget {
  isActive?: MaybeRefOrGetter<unknown>;
  selectors?: string[];
  elements?: Array<Ref<HTMLElement | null | undefined> | MaybeRefOrGetter<HTMLElement | null | undefined>>;
  onOutside: (event: MouseEvent | PointerEvent) => void;
}

export interface OutsideInteractionOptions {
  eventName?: DocumentEventName;
  targets: OutsideInteractionTarget[];
}

function isInsideSelector(target: HTMLElement, selectors: string[] = []): boolean {
  return selectors.some((selector) => Boolean(target.closest(selector)));
}

function isInsideElement(target: Node, element: HTMLElement | null | undefined): boolean {
  return Boolean(element && element.contains(target));
}

function isTargetActive(target: OutsideInteractionTarget): boolean {
  return target.isActive === undefined || Boolean(toValue(target.isActive));
}

export function useOutsideInteraction(options: OutsideInteractionOptions) {
  const eventName = options.eventName || 'click';

  function handleDocumentEvent(event: MouseEvent | PointerEvent): void {
    const rawTarget = event.target;
    if (!(rawTarget instanceof Node)) {
      return;
    }

    const elementTarget = rawTarget instanceof HTMLElement ? rawTarget : rawTarget.parentElement;
    for (const target of options.targets) {
      if (!isTargetActive(target)) {
        continue;
      }

      if (elementTarget && isInsideSelector(elementTarget, target.selectors)) {
        continue;
      }

      if ((target.elements || []).some((element) => isInsideElement(rawTarget, toValue(element)))) {
        continue;
      }

      target.onOutside(event);
    }
  }

  onMounted(() => {
    document.addEventListener(eventName, handleDocumentEvent);
  });

  onBeforeUnmount(() => {
    document.removeEventListener(eventName, handleDocumentEvent);
  });

  return {
    handleDocumentEvent,
  };
}

export type OutsideInteraction = ReturnType<typeof useOutsideInteraction>;
