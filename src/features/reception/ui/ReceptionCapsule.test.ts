import { describe, expect, it } from 'vitest';
import receptionCapsuleSource from './ReceptionCapsule.vue?raw';

describe('ReceptionCapsule accordion order', () => {
  it('keeps chronic refill before AI recommendations', () => {
    const sections = Array.from(
      receptionCapsuleSource.matchAll(
        /<span class="section-number">(\d)<\/span>\s*<span class="section-copy">\s*<span class="section-title">([^<]+)<\/span>/g,
      ),
      ([, number, title]) => ({ number, title }),
    );

    expect(sections).toEqual([
      { number: '1', title: '就诊历史信息' },
      { number: '2', title: '慢病复诊配药' },
      { number: '3', title: 'AI 推荐' },
      { number: '4', title: '临床诊疗建议' },
    ]);
  });

  it('loads AI recommendations when the third section opens', () => {
    expect(receptionCapsuleSource).toContain(
      'if (nextSection === 3) void chronicAiRecommendations.load();',
    );
  });
});
