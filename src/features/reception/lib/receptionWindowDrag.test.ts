// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import { shouldRequestReceptionWindowDrag } from './receptionWindowDrag';

describe('shouldRequestReceptionWindowDrag', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <button id="capsule">
        <span id="capsule-label">患者</span>
      </button>
      <header id="header">
        <div id="patient-summary"><span id="patient-name">患者</span></div>
        <button id="close"><span id="close-icon">关闭</span></button>
      </header>
      <div id="outside"></div>
    `;
  });

  it('allows dragging from a compact capsule even though the handle is a button', () => {
    const capsule = document.querySelector('#capsule');
    const label = document.querySelector('#capsule-label');

    expect(shouldRequestReceptionWindowDrag(capsule, label)).toBe(true);
  });

  it('allows dragging from non-interactive content inside the expanded header', () => {
    const header = document.querySelector('#header');
    const patientName = document.querySelector('#patient-name');

    expect(shouldRequestReceptionWindowDrag(header, patientName)).toBe(true);
  });

  it('keeps nested header controls independent from window dragging', () => {
    const header = document.querySelector('#header');
    const closeIcon = document.querySelector('#close-icon');

    expect(shouldRequestReceptionWindowDrag(header, closeIcon)).toBe(false);
  });

  it('rejects targets outside the declared drag handle', () => {
    const header = document.querySelector('#header');
    const outside = document.querySelector('#outside');

    expect(shouldRequestReceptionWindowDrag(header, outside)).toBe(false);
    expect(shouldRequestReceptionWindowDrag(null, outside)).toBe(false);
  });
});
