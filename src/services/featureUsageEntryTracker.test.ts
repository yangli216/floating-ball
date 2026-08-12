import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  trackFeatureUsage: vi.fn(),
}));

vi.mock('./featureUsageTracker', () => ({
  trackFeatureUsage: mocks.trackFeatureUsage,
}));

import {
  trackConsultationAssistEntry,
  trackSmartConsultationEntry,
  trackVoiceConsultationEntry,
} from './featureUsageEntryTracker';

describe('featureUsageEntryTracker privacy boundary', () => {
  beforeEach(() => {
    mocks.trackFeatureUsage.mockReset();
  });

  it('does not forward clinical identifiers from HIS entry contexts', () => {
    const clinicalContext = {
      patient: { idPi: 'PATIENT-001', naPi: '患者甲', idVis: 'VISIT-001' },
      consultationId: 'VISIT-001',
      payload: { patientId: 'PATIENT-001', patientName: '患者甲', visitId: 'VISIT-001' },
    };

    trackSmartConsultationEntry(clinicalContext);
    trackVoiceConsultationEntry(clinicalContext);
    trackConsultationAssistEntry('medication', clinicalContext);

    expect(mocks.trackFeatureUsage).toHaveBeenCalledTimes(3);
    for (const [event] of mocks.trackFeatureUsage.mock.calls) {
      const serialized = JSON.stringify(event);
      expect(serialized).not.toContain('PATIENT-001');
      expect(serialized).not.toContain('患者甲');
      expect(serialized).not.toContain('VISIT-001');
      expect(event).not.toHaveProperty('consultationId');
      expect(event).not.toHaveProperty('payload');
      expect(event).not.toHaveProperty('idempotencyKey');
    }
  });
});
