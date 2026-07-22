// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { sanitizeExternalHtml, sanitizeInlineStyle } from './safeHtml';

describe('sanitizeExternalHtml', () => {
  it('keeps medical layout and template data attributes while removing active content', () => {
    const safe = sanitizeExternalHtml(`
      <section data-id="chiefComplaint" data-type="text" onclick="alert(1)"
        style="color: #334155; position: fixed; background: url(javascript:alert(1)); padding: 6px">
        <table><tr><td>主诉</td></tr></table>
        <script>alert(1)</script>
        <iframe src="https://attacker.example"></iframe>
        <form action="https://attacker.example"><input name="secret"></form>
      </section>
    `);

    expect(safe).toContain('data-id="chiefComplaint"');
    expect(safe).toContain('data-type="text"');
    expect(safe).toContain('<table>');
    expect(safe).toContain('color: #334155');
    expect(safe).toContain('padding: 6px');
    expect(safe).not.toMatch(/onclick|<script|<iframe|<form|<input/i);
    expect(safe).not.toMatch(/position\s*:|url\s*\(|javascript:/i);
  });

  it('removes dangerous links and image sources', () => {
    const safe = sanitizeExternalHtml(`
      <a href="javascript:alert(1)" target="_blank">危险链接</a>
      <img src="javascript:alert(1)" onerror="alert(1)">
      <img src="data:image/png;base64,AAAA" alt="safe">
    `);

    expect(safe).not.toMatch(/href=|target=|javascript:|onerror/i);
    expect(safe).toContain('data:image/png;base64,AAAA');
  });
});

describe('sanitizeInlineStyle', () => {
  it('allows document formatting but rejects overlay and executable CSS', () => {
    expect(sanitizeInlineStyle(
      'font-size: 13px; border: 1px solid #ccc; position: fixed; z-index: 9999; color: red !important',
    )).toBe('font-size: 13px; border: 1px solid #ccc');
  });
});
