import { describe, expect, it } from 'vitest';
import type { TreatmentRecommendation } from '@/types/consultation';
import {
  buildClinicalResultNavigationItems,
  useClinicalResultColumnNavigation,
} from './useClinicalResultColumnNavigation';

function item(type: TreatmentRecommendation['type'], name: string): TreatmentRecommendation {
  return { type, name, reason: '', selected: false };
}

describe('clinical result column navigation', () => {
  it('builds only available treatment section anchors with concise labels', () => {
    expect(buildClinicalResultNavigationItems(2, [
      { type: 'medicine', title: '药品', items: [item('medicine', '二甲双胍')] },
      { type: 'exam', title: '检查项目', items: [] },
      { type: 'lab_test', title: '检验项目', items: [item('lab_test', '血常规')] },
    ])).toEqual([
      { key: 'diagnosis', label: '诊断', count: 2 },
      { key: 'medicine', label: '药品', count: 1 },
      { key: 'lab_test', label: '检验', count: 1 },
    ]);
  });

  it('scrolls only the registered right column container to the requested section', () => {
    const scrollToCalls: ScrollToOptions[] = [];
    const target = { getBoundingClientRect: () => ({ top: 360 }) } as HTMLElement;
    const navigator = { offsetHeight: 52 } as HTMLElement;
    const container = {
      scrollTop: 120,
      getBoundingClientRect: () => ({ top: 100 }),
      querySelector: (selector: string) => selector === '[data-clinical-result-navigator]'
        ? navigator
        : selector === '[data-clinical-section="lab_test"]'
          ? target
          : null,
      scrollTo: (options: ScrollToOptions) => scrollToCalls.push(options),
    } as unknown as HTMLElement;
    const navigation = useClinicalResultColumnNavigation(() => [
      { key: 'diagnosis', label: '诊断', count: 1 },
      { key: 'lab_test', label: '检验', count: 3 },
    ]);
    navigation.containerRef.value = container;

    navigation.navigateTo('lab_test');

    expect(navigation.activeKey.value).toBe('lab_test');
    expect(scrollToCalls).toEqual([{ top: 318, behavior: 'smooth' }]);
  });

  it('moves a lower action into the safe viewport before opening its overlay', () => {
    const scrollToCalls: ScrollToOptions[] = [];
    const anchor = {
      getBoundingClientRect: () => ({ top: 690, bottom: 720 }),
    } as HTMLElement;
    const navigator = { offsetHeight: 52 } as HTMLElement;
    const container = {
      scrollTop: 300,
      contains: (element: Node) => element === anchor,
      getBoundingClientRect: () => ({ top: 100, bottom: 800, height: 700 }),
      querySelector: (selector: string) => selector === '[data-clinical-result-navigator]'
        ? navigator
        : null,
      scrollTo: (options: ScrollToOptions) => scrollToCalls.push(options),
    } as unknown as HTMLElement;
    const navigation = useClinicalResultColumnNavigation(() => []);
    navigation.containerRef.value = container;

    navigation.revealOverlayAnchor({ currentTarget: anchor } as unknown as Event);

    expect(scrollToCalls).toEqual([{ top: 818, behavior: 'smooth' }]);
  });
});
