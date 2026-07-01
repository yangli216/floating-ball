import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ regionalPost: vi.fn(), regionalGet: vi.fn() }));

vi.mock('./regionalClient', () => ({
  getCachedBootstrap: () => ({ pmphai: { enabled: true } }),
  regionalPost: mocks.regionalPost,
  regionalGet: mocks.regionalGet,
}));

vi.mock('./featureUsageTracker', () => ({ trackFeatureUsage: vi.fn() }));

import { pmphaiService } from './pmphai';

describe('server-managed PMPHAI routing', () => {
  beforeEach(() => {
    mocks.regionalPost.mockReset();
    mocks.regionalGet.mockReset();
    pmphaiService.clearCache();
  });

  it('uses server proxy for search, clip, list and page URL', async () => {
    mocks.regionalPost
      .mockResolvedValueOnce([{ id: '1', name: 'result', content: 'content' }])
      .mockResolvedValueOnce({ xml: '<p>clip</p>' })
      .mockResolvedValueOnce({ rows: [], totalRows: 0, totalPage: 0, page: 0, pageSize: 10 })
      .mockResolvedValueOnce({ url: 'https://inside.example/detail' });

    await pmphaiService.search({ query: 'test' });
    await pmphaiService.getClip('1');
    await pmphaiService.listSearch({ key: 'test' });
    await pmphaiService.getPageUrl({ pageName: 'detail', id: '1' });

    expect(mocks.regionalPost.mock.calls.map(call => call[0])).toEqual([
      '/v1/knowledge/pmphai/search',
      '/v1/knowledge/pmphai/clip',
      '/v1/knowledge/pmphai/list',
      '/v1/knowledge/pmphai/page-url',
    ]);
  });

  it('uses server proxy for knowledge base metadata', async () => {
    mocks.regionalGet.mockResolvedValue({});
    await pmphaiService.getKnowledgeBases();
    mocks.regionalGet.mockResolvedValue([]);
    await pmphaiService.getCategories('kb-1');
    expect(mocks.regionalGet.mock.calls.map(call => call[0])).toEqual([
      '/v1/knowledge/pmphai/kgbases',
      '/v1/knowledge/pmphai/categories?kgBaseId=kb-1',
    ]);
  });
});
