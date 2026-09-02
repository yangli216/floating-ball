import { nextTick, ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import type { AppPatient } from '@/types/appState';
import type { OutpatientEmrPreparedWritebackPayload } from '../types';
import { useVoiceOutpatientEmrWorkflow } from './useVoiceOutpatientEmrWorkflow';

function createPatient(): AppPatient {
  return {
    identity: { patientId: 'P001', visitId: 'VIS-001' },
    demographics: {
      patientName: '张三',
      genderText: '男性',
      ageText: '45岁',
    },
    clinical: {},
    patientId: 'P001',
    visitId: 'VIS-001',
    patientName: '张三',
    genderText: '男性',
    ageText: '45岁',
    idPi: 'P001',
    idVis: 'VIS-001',
    naPi: '张三',
    sdSexText: '男性',
  };
}

function createPreparedPayload(): OutpatientEmrPreparedWritebackPayload {
  return {
    consultationId: 'VIS-001',
    timestamp: 123,
    resultType: 'record-confirmed',
    requestId: 'REQ-001',
    referenceType: 'batch',
    action: 'batch',
    referenceStatus: 'pending',
    referenceMessage: '等待 HIS 回执',
    outpatientRecord: {
      schemaVersion: 'outpatient-record.v1',
      chiefComplaint: '咳嗽三天',
    },
    diagList: [{ naDiag: '急性上呼吸道感染', cdIcd10: 'J06.900', fgMain: '1' }],
    orderList: [],
    writebackScope: {
      recordFields: ['chiefComplaint'],
      includeDiagnosis: true,
      orderTypes: [],
    },
  };
}

describe('useVoiceOutpatientEmrWorkflow', () => {
  it('continues a validated voice result into the formal outpatient analysis request', async () => {
    const currentPatient = ref<AppPatient | null>(createPatient());
    const startAnalysis = vi.fn().mockResolvedValue(undefined);
    const workflow = useVoiceOutpatientEmrWorkflow({ currentPatient, startAnalysis });

    expect(workflow.prepareFromStartVoice({
      idPi: 'P001',
      idVis: 'VIS-001',
      outpatientEmr: {
        templateId: 'TPL-001',
        templateName: '门诊模板',
        templateHtml: '<section data-id="chief"></section>',
        templateDefinition: '[{"ID":"chief"}]',
        targetFieldIds: ['chief'],
        requestId: 'REQ-001',
      },
    })).toBe(true);

    const payload = createPreparedPayload();
    await expect(workflow.handleWritebackPrepared(payload)).resolves.toBe(true);

    expect(startAnalysis).toHaveBeenCalledWith(expect.objectContaining({
      visitId: 'VIS-001',
      templateId: 'TPL-001',
      targetFieldIds: ['chief'],
      requestId: 'REQ-001',
      patient: {
        idPi: 'P001',
        name: '张三',
        sdSexText: '男性',
        ageText: '45岁',
      },
      recordContext: expect.objectContaining({
        recordText: '主诉：咳嗽三天',
      }),
    }));
    const request = startAnalysis.mock.calls[0][0];
    expect(workflow.resolveBaseWritebackPayload(request)).toBe(payload);
    expect(workflow.deferredWritebackRequestId.value).toBe('REQ-001');
  });

  it('clears the continuation when the current visit changes', async () => {
    const currentPatient = ref<AppPatient | null>(createPatient());
    const workflow = useVoiceOutpatientEmrWorkflow({
      currentPatient,
      startAnalysis: vi.fn().mockResolvedValue(undefined),
    });
    workflow.prepareFromStartVoice({
      idVis: 'VIS-001',
      outpatientEmr: {
        templateId: 'TPL-001',
        templateName: '门诊模板',
        templateHtml: '<section></section>',
        templateDefinition: '[]',
        targetFieldIds: ['chief'],
        requestId: 'REQ-001',
      },
    });

    currentPatient.value = {
      ...createPatient(),
      identity: { patientId: 'P001', visitId: 'VIS-002' },
      visitId: 'VIS-002',
      idVis: 'VIS-002',
    };
    await nextTick();

    expect(workflow.hasTemplateContinuation.value).toBe(false);
  });
});
