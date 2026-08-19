import { describe, expect, it } from 'vitest';
import { resolvePatientAvatar } from './patientAvatar';

describe('resolvePatientAvatar patient age units', () => {
  it('treats a composite month and day age as an infant', () => {
    expect(resolvePatientAvatar({ gender: 'F', ageText: '6月15天' })).toBe('/avatar/girlBaby.png');
    expect(resolvePatientAvatar({ gender: 'M', ageText: '6月15天' })).toBe('/avatar/boyBaby.png');
  });
});
