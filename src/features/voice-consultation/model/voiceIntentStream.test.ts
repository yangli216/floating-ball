import { describe, expect, it } from 'vitest';
import {
  applyVoiceIntentStreamEvent,
  createVoiceIntentStreamAccumulator,
  createVoiceIntentStreamParser,
} from './voiceIntentStream';

describe('voiceIntentStream', () => {
  it('parses chunked NDJSON events and builds a compatible extraction payload', () => {
    const accumulator = createVoiceIntentStreamAccumulator();
    const parser = createVoiceIntentStreamParser((event) => applyVoiceIntentStreamEvent(accumulator, event));

    parser.push('{"event":"record_core","data":{"chiefComplaint":"咳嗽2天"}}\n{"event":"diag');
    parser.push('noses","data":[{"name":"急性支气管炎"}]}\n');
    parser.push('{"event":"history_context","data":{"personalHistory":"吸烟20年","menstrualHistory":"周期28天"}}\n');
    parser.push('{"event":"recommendation_plan","data":{"mode":"diagnostic_first","recommendNow":["lab_test"]}}');
    parser.flush();

    expect(accumulator.payload.recordDraft?.chiefComplaint).toBe('咳嗽2天');
    expect(accumulator.payload.recordDraft?.personalHistory).toBe('吸烟20年');
    expect(accumulator.payload.recordDraft?.menstrualHistory).toBe('周期28天');
    expect(accumulator.payload.diagnosisHints?.[0]?.name).toBe('急性支气管炎');
    expect(accumulator.payload.recommendationPlan?.mode).toBe('diagnostic_first');
    expect(accumulator.readySections).toEqual(['record_core', 'diagnoses', 'history_context', 'recommendation_plan']);
  });

  it('ignores ordinary pretty-printed JSON so the legacy parser can handle it at completion', () => {
    const events: unknown[] = [];
    const parser = createVoiceIntentStreamParser((event) => events.push(event));
    parser.push('{\n  "recordDraft": {\n    "chiefComplaint": "咳嗽"\n  }\n}');
    parser.flush();
    expect(events).toEqual([]);
  });
});
