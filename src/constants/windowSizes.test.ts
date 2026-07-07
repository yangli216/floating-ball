import { describe, expect, it } from 'vitest';
import { getReceptionCapsuleSize, getWindowSizeConstraints, getWindowSizeForView } from './windowSizes';

describe('getReceptionCapsuleSize', () => {
  it('avoids a fixed tall blank area for a short risk list', () => {
    expect(getReceptionCapsuleSize({ expanded: true, riskCount: 1 })).toEqual({
      width: 280,
      height: 196,
    });
    expect(getReceptionCapsuleSize({ expanded: true, riskCount: 4 })).toEqual({
      width: 280,
      height: 316,
    });
  });

  it('reserves action space and caps the capsule height', () => {
    expect(getReceptionCapsuleSize({
      expanded: true,
      riskCount: 8,
      hasChronicRefill: true,
      hasReportInterpretation: true,
    })).toEqual({
      width: 280,
      height: 520,
    });
  });
});

describe('chronic refill confirmation window', () => {
  it('uses a bounded desktop workspace size that fits smaller displays', () => {
    expect(getWindowSizeForView('chronic-refill-confirmation')).toEqual({
      width: 820,
      height: 720,
    });
    expect(getWindowSizeConstraints('chronic-refill-confirmation')).toEqual({
      minWidth: 720,
      minHeight: 620,
    });
  });
});

describe('patient memory workspace', () => {
  it('uses a readable bounded workspace size', () => {
    expect(getWindowSizeForView('patient-memory')).toEqual({
      width: 1120,
      height: 760,
    });
    expect(getWindowSizeConstraints('patient-memory')).toEqual({
      minWidth: 980,
      minHeight: 620,
    });
  });
});
