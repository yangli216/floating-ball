import { describe, expect, it } from 'vitest';
import { useClinicalResultProgressiveIntentApplication } from './useClinicalResultProgressiveIntentApplication';

describe('useClinicalResultProgressiveIntentApplication', () => {
  it('resets once and patches only newly arrived sections in the same stream', () => {
    const controller = useClinicalResultProgressiveIntentApplication();

    expect(controller.plan({
      sessionKey: 'visit-1:round-1',
      generation: { status: 'streaming', readySections: [] },
    })).toMatchObject({ mode: 'reset', newSections: [] });

    expect(controller.plan({
      sessionKey: 'visit-1:round-1',
      generation: { status: 'streaming', readySections: ['record_core'] },
    })).toMatchObject({ mode: 'patch', newSections: ['record_core'] });

    expect(controller.plan({
      sessionKey: 'visit-1:round-1',
      generation: { status: 'streaming', readySections: ['record_core', 'diagnoses'] },
    })).toMatchObject({ mode: 'patch', newSections: ['diagnoses'] });

    expect(controller.plan({
      sessionKey: 'visit-1:round-1',
      generation: { status: 'complete', readySections: ['record_core', 'diagnoses', 'record_extra'] },
    })).toMatchObject({
      mode: 'finalize',
      newSections: ['record_extra'],
      continuesStreamingSession: true,
    });
  });

  it('starts with a clean reset when the generation round changes', () => {
    const controller = useClinicalResultProgressiveIntentApplication();
    controller.plan({
      sessionKey: 'visit-1:round-1',
      generation: { status: 'streaming', readySections: ['record_core'] },
    });

    expect(controller.plan({
      sessionKey: 'visit-1:round-2',
      generation: { status: 'streaming', readySections: ['record_core', 'diagnoses'] },
    })).toMatchObject({
      mode: 'reset',
      newSections: ['record_core', 'diagnoses'],
      continuesStreamingSession: false,
    });
  });

  it('treats non-streamed complete inputs as full replacements', () => {
    const controller = useClinicalResultProgressiveIntentApplication();
    expect(controller.plan({
      sessionKey: 'visit-1:cache',
      generation: { status: 'complete', readySections: ['record_core'] },
    })).toMatchObject({ mode: 'reset', continuesStreamingSession: false });
  });
});
