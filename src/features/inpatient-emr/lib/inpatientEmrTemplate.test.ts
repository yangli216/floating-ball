// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  buildEditableInpatientEmrPreviewHtml,
  fillInpatientEmrTemplateHtml,
  parseInpatientEmrTemplate,
} from './inpatientEmrTemplate';

const MALICIOUS_TEMPLATE = `
  <section onclick="alert(1)">
    <p data-id="chiefComplaint" data-type="text" data-name="主诉" style="color: #334155; position: fixed">
      <span class="tag-value">原值</span>
    </p>
    <script>alert(1)</script>
  </section>
`;

describe('inpatient EMR HTML boundary', () => {
  it('sanitizes before parsing and preserves template field contracts', () => {
    const parsed = parseInpatientEmrTemplate(MALICIOUS_TEMPLATE);

    expect(parsed.fields).toHaveLength(1);
    expect(parsed.fields[0]).toMatchObject({ id: 'chiefComplaint', name: '主诉' });
  });

  it('sanitizes editable preview HTML and writes field values as text', () => {
    const parsed = parseInpatientEmrTemplate(MALICIOUS_TEMPLATE);
    const preview = buildEditableInpatientEmrPreviewHtml(
      MALICIOUS_TEMPLATE,
      { chiefComplaint: '<img src=x onerror=alert(1)>头晕' },
      parsed.fields.map((field) => ({ ...field, aiSuitable: true })),
    );

    expect(preview).toContain('data-inpatient-emr-field-id="chiefComplaint"');
    expect(preview).toContain('contenteditable="true"');
    expect(preview).toContain('&lt;img src=x onerror=alert(1)&gt;头晕');
    expect(preview).not.toMatch(/<script|onclick=|position\s*:/i);

    const filled = fillInpatientEmrTemplateHtml(
      MALICIOUS_TEMPLATE,
      { chiefComplaint: '<script>alert(1)</script>头晕' },
    );
    expect(filled).toContain('&lt;script&gt;alert(1)&lt;/script&gt;头晕');
    expect(filled).not.toContain('<script>');
  });
});
