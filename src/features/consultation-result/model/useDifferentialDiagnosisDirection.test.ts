// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { useDifferentialDiagnosisDirection } from './useDifferentialDiagnosisDirection';

describe('useDifferentialDiagnosisDirection', () => {
  it('keeps an included direction separate from formal promotion', () => {
    const controller = useDifferentialDiagnosisDirection();

    controller.include('diag-a');

    expect(controller.isIncluded('diag-a')).toBe(true);
    expect(controller.isPromoted('diag-a')).toBe(false);
    expect(controller.serialize()).toEqual({
      includedKeys: ['diag-a'],
      promotedKeys: [],
    });
  });

  it('moves a direction into promoted state and supports a changed standard key', () => {
    const controller = useDifferentialDiagnosisDirection();
    controller.include('raw-diag');

    controller.promote('raw-diag', 'standard-diag');

    expect(controller.isIncluded('raw-diag')).toBe(false);
    expect(controller.isPromoted('standard-diag')).toBe(true);
    expect(controller.serialize()).toEqual({
      includedKeys: [],
      promotedKeys: ['standard-diag'],
    });
  });

  it('restores only valid unique keys and resets between patient contexts', () => {
    const controller = useDifferentialDiagnosisDirection();

    controller.restore({
      includedKeys: ['diag-a', 'diag-a', 'diag-promoted', 12],
      promotedKeys: ['diag-promoted', '', 'diag-promoted'],
    });

    expect(controller.serialize()).toEqual({
      includedKeys: ['diag-a'],
      promotedKeys: ['diag-promoted'],
    });

    controller.reset();
    expect(controller.serialize()).toEqual({ includedKeys: [], promotedKeys: [] });
  });
});
