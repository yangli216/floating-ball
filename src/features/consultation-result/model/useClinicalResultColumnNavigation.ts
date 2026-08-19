import { ref, type Ref } from 'vue';
import type { TreatmentRecommendation } from '@/types/consultation';

export type ClinicalResultNavigationKey = 'diagnosis' | TreatmentRecommendation['type'];

export interface ClinicalResultNavigationItem {
  key: ClinicalResultNavigationKey;
  label: string;
  count: number;
}

export interface ClinicalResultNavigationTreatmentSection {
  type: TreatmentRecommendation['type'];
  title: string;
  items: TreatmentRecommendation[];
}

export interface ClinicalResultColumnNavigation {
  containerRef: Ref<HTMLElement | null>;
  activeKey: Ref<ClinicalResultNavigationKey>;
  navigateTo: (key: ClinicalResultNavigationKey) => void;
  revealOverlayAnchor: (event?: Event) => void;
  syncActiveSection: () => void;
}

const NAVIGATOR_SELECTOR = '[data-clinical-result-navigator]';

function getTargetSelector(key: ClinicalResultNavigationKey): string {
  return `[data-clinical-section="${key}"]`;
}

function getStickyOffset(container: HTMLElement): number {
  const navigator = container.querySelector<HTMLElement>(NAVIGATOR_SELECTOR);
  return (navigator?.offsetHeight || 0) + 10;
}

export function buildClinicalResultNavigationItems(
  diagnosisCount: number,
  treatmentSections: ClinicalResultNavigationTreatmentSection[],
): ClinicalResultNavigationItem[] {
  return [
    { key: 'diagnosis', label: '诊断', count: Math.max(0, diagnosisCount) },
    ...treatmentSections
      .filter((section) => section.items.length > 0)
      .map((section) => ({
        key: section.type,
        label: section.title.replace('项目', ''),
        count: section.items.length,
      })),
  ];
}

export function useClinicalResultColumnNavigation(
  getItems: () => ClinicalResultNavigationItem[],
): ClinicalResultColumnNavigation {
  const containerRef = ref<HTMLElement | null>(null);
  const activeKey = ref<ClinicalResultNavigationKey>('diagnosis');

  function navigateTo(key: ClinicalResultNavigationKey): void {
    const container = containerRef.value;
    const target = container?.querySelector<HTMLElement>(getTargetSelector(key));
    if (!container || !target) return;

    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const top = Math.max(
      0,
      container.scrollTop + targetRect.top - containerRect.top - getStickyOffset(container),
    );
    activeKey.value = key;
    container.scrollTo({ top, behavior: 'smooth' });
  }

  function syncActiveSection(): void {
    const container = containerRef.value;
    if (!container) return;

    const items = getItems();
    const containerTop = container.getBoundingClientRect().top;
    const threshold = containerTop + getStickyOffset(container) + 8;
    let current = items[0]?.key || 'diagnosis';

    for (const item of items) {
      const target = container.querySelector<HTMLElement>(getTargetSelector(item.key));
      if (target && target.getBoundingClientRect().top <= threshold) {
        current = item.key;
      }
    }
    activeKey.value = current;
  }

  function revealOverlayAnchor(event?: Event): void {
    const container = containerRef.value;
    const anchor = event?.currentTarget as HTMLElement | null;
    if (!container || !anchor || typeof anchor.getBoundingClientRect !== 'function' || !container.contains(anchor)) return;

    const containerRect = container.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    const stickyOffset = getStickyOffset(container);
    const safeTop = containerRect.top + stickyOffset;
    const reservedOverlayHeight = Math.min(360, containerRect.height * 0.45);
    const safeBottom = containerRect.bottom - reservedOverlayHeight;
    if (anchorRect.top >= safeTop && anchorRect.bottom <= safeBottom) return;

    const top = Math.max(
      0,
      container.scrollTop + anchorRect.top - containerRect.top - stickyOffset - 10,
    );
    container.scrollTo({ top, behavior: 'smooth' });
  }

  return {
    containerRef,
    activeKey,
    navigateTo,
    revealOverlayAnchor,
    syncActiveSection,
  };
}
