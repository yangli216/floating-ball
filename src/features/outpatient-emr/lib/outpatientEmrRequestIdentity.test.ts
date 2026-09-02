import { describe, expect, it } from 'vitest';
import type { OutpatientEmrAnalysisRequest } from '../types';
import { isSameOutpatientEmrAnalysisRequestSnapshot } from './outpatientEmrRequestIdentity';

function createRequest(
  overrides: Partial<OutpatientEmrAnalysisRequest> = {},
): OutpatientEmrAnalysisRequest {
  return {
    visitId: 'VIS-001',
    templateId: 'TPL-001',
    templateName: '门诊模板',
    templateHtml: '<section data-id="article-one" data-article="病史" data-name="病史"></section>',
    templateDefinition: '[{"ID":"article-one","NAME":"病史","ARTICLE":"病史","eles":[]}]',
    targetFieldIds: ['one', 'two'],
    recordContext: { recordText: '咳嗽3天。' },
    requestId: 'REQ-001',
    ...overrides,
  };
}

describe('outpatient EMR request snapshot identity', () => {
  it('treats reordered unique target ids as the same selection', () => {
    expect(isSameOutpatientEmrAnalysisRequestSnapshot(
      createRequest(),
      createRequest({ targetFieldIds: ['two', 'one'] }),
    )).toBe(true);
  });

  it.each([
    [[]],
    [['one', 'one']],
    [[' one', 'two']],
  ])('never restores an invalid target selection', (targetFieldIds) => {
    expect(isSameOutpatientEmrAnalysisRequestSnapshot(
      createRequest({ targetFieldIds }),
      createRequest({ targetFieldIds }),
    )).toBe(false);
  });

  it('compares record context by JSON value instead of object key order', () => {
    expect(isSameOutpatientEmrAnalysisRequestSnapshot(
      createRequest({ recordContext: { recordText: '咳嗽3天。', severity: 2 } }),
      createRequest({ recordContext: { severity: 2, recordText: '咳嗽3天。' } }),
    )).toBe(true);
  });

  it.each([
    ['visit', { visitId: 'VIS-002' }],
    ['template id', { templateId: 'TPL-002' }],
    ['template name', { templateName: '门诊复诊模板' }],
    ['rendered template', { templateHtml: '<section data-id="changed"></section>' }],
    ['template definition', { templateDefinition: '[]' }],
    ['target selection', { targetFieldIds: ['one'] }],
    ['patient facts', { patient: { idPi: 'PAT-002' } }],
    ['record context', { recordContext: { recordText: '发热1天。' } }],
    ['request id', { requestId: 'REQ-002' }],
  ])('rejects a changed %s', (_label, overrides) => {
    expect(isSameOutpatientEmrAnalysisRequestSnapshot(
      createRequest(),
      createRequest(overrides),
    )).toBe(false);
  });
});
