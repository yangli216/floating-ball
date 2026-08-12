import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mocks.invoke,
}));

import {
  recordHisIntegrationLog,
  sanitizeHisLogUrl,
  summarizeHisPayload,
} from './hisIntegrationLog';

describe('HIS integration log privacy projection', () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    mocks.invoke.mockResolvedValue('log-id');
  });

  it('reduces request arrays to counts and strips URL credentials, query, and fragment', () => {
    expect(summarizeHisPayload([{
      idPi: 'PATIENT-ID-SENTINEL',
      idVis: 'VISIT-ID-SENTINEL',
      patientName: 'PATIENT-NAME-SENTINEL',
      doctorName: 'DOCTOR-NAME-SENTINEL',
      token: 'TOKEN-SENTINEL',
      opaqueAlias: { nestedUnknown: 'UNKNOWN-NESTED-SENTINEL' },
      numericIdentity: 987654321,
    }])).toEqual({
      type: 'array',
      length: 1,
      itemTypes: { object: 1 },
    });
    expect(sanitizeHisLogUrl(
      'https://URL-USER-SENTINEL:URL-PASSWORD-SENTINEL@his.example:8443/root/api'
      + '?idPi=PATIENT-ID-SENTINEL#FRAGMENT-SENTINEL',
    )).toBe('/root/api');
  });

  it('projects every field again immediately before durable storage', async () => {
    const maliciousEntry = {
      traceId: 'TRACE-ID-SENTINEL',
      direction: 'outbound',
      operation: 'api/patient?query=QUERY-SENTINEL#FRAGMENT-SENTINEL',
      method: 'METHOD-SENTINEL',
      path: 'api/patient?query=QUERY-SENTINEL#FRAGMENT-SENTINEL',
      url: 'https://URL-USER-SENTINEL:URL-PASSWORD-SENTINEL@his.example:8443/root/api'
        + '?query=QUERY-SENTINEL#FRAGMENT-SENTINEL',
      status: 'STATUS-SENTINEL',
      httpStatus: 987654321,
      durationMs: 987654321,
      businessCode: 'BUSINESS-CODE-SENTINEL-TOO-LONG',
      patientId: 'PATIENT-ID-SENTINEL',
      consultationId: 'VISIT-ID-SENTINEL',
      requestId: 'REQUEST-ID-SENTINEL',
      businessMessage: 'PATIENT-NAME-SENTINEL',
      errorMessage: 'DOCTOR-NAME-SENTINEL',
      unknownCallerField: 'UNKNOWN-CALLER-FIELD-SENTINEL',
      requestSummary: [{
        admissionId: 'ADMISSION-ID-SENTINEL',
        token: 'TOKEN-SENTINEL',
        opaqueAlias: { nestedUnknown: 'UNKNOWN-NESTED-SENTINEL' },
        numericIdentity: 987654321,
      }],
      responseSummary: {
        patientName: 'RESPONSE-PATIENT-SENTINEL',
        doctorName: 'RESPONSE-DOCTOR-SENTINEL',
      },
    } as unknown as Parameters<typeof recordHisIntegrationLog>[0];

    await recordHisIntegrationLog(maliciousEntry);

    const serialized = JSON.stringify(mocks.invoke.mock.calls);
    for (const secret of [
      'URL-USER-SENTINEL',
      'URL-PASSWORD-SENTINEL',
      'his.example',
      'QUERY-SENTINEL',
      'FRAGMENT-SENTINEL',
      'TRACE-ID-SENTINEL',
      'METHOD-SENTINEL',
      'STATUS-SENTINEL',
      'BUSINESS-CODE-SENTINEL',
      'PATIENT-ID-SENTINEL',
      'VISIT-ID-SENTINEL',
      'REQUEST-ID-SENTINEL',
      'ADMISSION-ID-SENTINEL',
      'PATIENT-NAME-SENTINEL',
      'DOCTOR-NAME-SENTINEL',
      'TOKEN-SENTINEL',
      'RESPONSE-PATIENT-SENTINEL',
      'RESPONSE-DOCTOR-SENTINEL',
      'UNKNOWN-NESTED-SENTINEL',
      'UNKNOWN-CALLER-FIELD-SENTINEL',
      '987654321',
    ]) {
      expect(serialized).not.toContain(secret);
    }
    const persistedEntry = mocks.invoke.mock.calls[0][1].entry;
    expect(persistedEntry).toEqual({
      traceId: expect.stringMatching(/^his-\d{10,16}-[0-9a-f]{1,16}$/i),
      direction: 'outbound',
      operation: '/api/patient',
      method: 'UNKNOWN',
      path: '/api/patient',
      url: '/root/api',
      status: 'error',
      httpStatus: undefined,
      businessCode: undefined,
      businessMessage: 'HIS 返回业务提示',
      durationMs: undefined,
      errorMessage: 'HIS 调用失败',
      requestSummary: {
        type: 'array',
        length: 1,
        itemTypes: { object: 1 },
      },
      responseSummary: {
        type: 'object',
        fieldCount: 2,
        valueTypes: { string: 2 },
      },
    });
    expect(persistedEntry).not.toHaveProperty('patientId');
    expect(persistedEntry).not.toHaveProperty('consultationId');
    expect(persistedEntry).not.toHaveProperty('requestId');
    expect(persistedEntry).not.toHaveProperty('unknownCallerField');
  });

  it('preserves the inbound bridge record exactly as supplied', async () => {
    const inboundEntry = {
      traceId: 'INBOUND-TRACE-SENTINEL',
      direction: 'inbound' as const,
      operation: 'INBOUND-OPERATION-SENTINEL',
      method: 'POST',
      path: '/api/consultation/start?patient=INBOUND-PATIENT-SENTINEL',
      status: 'success' as const,
      patientId: 'INBOUND-PATIENT-SENTINEL',
      consultationId: 'INBOUND-CONSULTATION-SENTINEL',
      requestId: 'INBOUND-REQUEST-SENTINEL',
    };

    await recordHisIntegrationLog(inboundEntry);

    expect(mocks.invoke).toHaveBeenCalledWith('record_his_integration_log', {
      entry: inboundEntry,
    });
  });

  it('retains only valid outbound technical enum and code values', async () => {
    await recordHisIntegrationLog({
      traceId: 'his-1723370400000-deadbeef',
      direction: 'outbound',
      operation: 'features/inpatient-emr',
      method: 'TRACE',
      path: 'features/inpatient-emr',
      status: 'business_error',
      httpStatus: 409,
      businessCode: 'ERR_409',
      durationMs: 1234.4,
    });

    expect(mocks.invoke).toHaveBeenCalledWith('record_his_integration_log', {
      entry: expect.objectContaining({
        traceId: 'his-1723370400000-deadbeef',
        direction: 'outbound',
        operation: '/features/inpatient-emr',
        method: 'TRACE',
        path: '/features/inpatient-emr',
        status: 'business_error',
        httpStatus: 409,
        businessCode: 'ERR_409',
        durationMs: 1234,
      }),
    });
  });

  it('preserves the documented inpatient EMR technical trace id', async () => {
    await recordHisIntegrationLog({
      traceId: 'inpatient-emr-1723370400000',
      direction: 'outbound',
      operation: 'features/inpatient-emr',
      method: 'TRACE',
      path: 'features/inpatient-emr',
      status: 'success',
    });

    expect(mocks.invoke).toHaveBeenCalledWith('record_his_integration_log', {
      entry: expect.objectContaining({
        traceId: 'inpatient-emr-1723370400000',
      }),
    });
  });

  it('preserves a UUID technical trace id', async () => {
    const traceId = '123e4567-e89b-42d3-a456-426614174000';
    await recordHisIntegrationLog({
      traceId,
      direction: 'outbound',
      operation: 'features/inpatient-emr',
      method: 'TRACE',
      path: 'features/inpatient-emr',
      status: 'success',
    });

    expect(mocks.invoke).toHaveBeenCalledWith('record_his_integration_log', {
      entry: expect.objectContaining({ traceId }),
    });
  });

  it.each([
    ['patient-like numeric id', '1234567890123456'],
    ['URL-shaped value', 'https://his.example/path?patient=123456'],
    ['free-text inpatient value', 'inpatient-emr-patient-ZhangSan'],
  ])('replaces an unsafe outbound trace id: %s', async (_label, traceId) => {
    await recordHisIntegrationLog({
      traceId,
      direction: 'outbound',
      operation: 'features/inpatient-emr',
      method: 'TRACE',
      path: 'features/inpatient-emr',
      status: 'success',
    });

    const persistedEntry = mocks.invoke.mock.calls[0][1].entry;
    expect(persistedEntry.traceId).not.toBe(traceId);
    expect(persistedEntry.traceId).toMatch(/^his-\d{10,16}-[0-9a-f]{1,16}$/i);
  });
});
