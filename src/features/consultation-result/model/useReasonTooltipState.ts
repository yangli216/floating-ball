import { ref } from 'vue';

export function useReasonTooltipState() {
  const activeReasonTooltipKey = ref<string | null>(null);

  function isReasonTooltipOpen(key: string): boolean {
    return activeReasonTooltipKey.value === key;
  }

  function toggleReasonTooltip(key: string, event?: Event): void {
    event?.stopPropagation();
    activeReasonTooltipKey.value = activeReasonTooltipKey.value === key ? null : key;
  }

  function closeReasonTooltip(): void {
    activeReasonTooltipKey.value = null;
  }

  function closeReasonTooltipIfOpen(): void {
    if (activeReasonTooltipKey.value) {
      closeReasonTooltip();
    }
  }

  return {
    activeReasonTooltipKey,
    closeReasonTooltip,
    closeReasonTooltipIfOpen,
    isReasonTooltipOpen,
    toggleReasonTooltip,
  };
}

export type ReasonTooltipState = ReturnType<typeof useReasonTooltipState>;
