import { beforeEach, describe, expect, it } from 'vitest';
import type { PatientMemoryObservation } from '@entities/patient-memory';
import {
  filterChangedPatientMemoryObservations,
  readPatientMemorySyncManifest,
  writePatientMemorySyncManifest,
} from './patientMemorySyncManifest';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return Array.from(this.values.keys())[index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

function observation(sourceKey: string, sourceVersion: string): PatientMemoryObservation {
  return {
    sourceKey,
    sourceType: 'visit_summary',
    sourceVersion,
    operation: 'upsert',
    payload: {},
    facts: [],
  };
}

describe('patientMemorySyncManifest', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: new MemoryStorage(),
      configurable: true,
    });
  });

  it('only resends changed observations and keeps rejected sources pending', () => {
    const previous = { memoryVersion: 2, sources: { 'visit:1': 'hash-1' } };
    const observations = [
      observation('visit:1', 'hash-1'),
      observation('visit:2', 'hash-2'),
      observation('visit:3', 'hash-3'),
    ];

    const changed = filterChangedPatientMemoryObservations(observations, previous);
    expect(changed.map((item) => item.sourceKey)).toEqual(['visit:2', 'visit:3']);

    writePatientMemorySyncManifest({
      orgScope: 'HIS-ORG-1',
      patientId: 'PAT-1',
      previous,
      observations: changed,
      rejectedSourceKeys: new Set(['visit:3']),
      memoryVersion: 3,
    });

    const stored = readPatientMemorySyncManifest('HIS-ORG-1', 'PAT-1');
    expect(stored).toEqual({
      memoryVersion: 3,
      sources: {
        'visit:1': 'hash-1',
        'visit:2': 'hash-2',
      },
    });
  });
});
