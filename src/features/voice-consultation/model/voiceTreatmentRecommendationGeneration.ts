import { chat } from '@/services/llm';
import { medicalDataService } from '@/services/medicalData';
import { explicitlyRequestsRestrictedMedicalItem } from '@/services/medicalCatalogPolicy';
import type { PharmacyOption } from '@/services/his';
import { PROMPTS } from '@/prompts';
import type { TreatmentRecommendation } from '@/types/consultation';
import {
  alignMedicineRecommendationsToInventory,
  assessTreatmentCatalogMatch,
  buildClinicalResultTreatmentRecommendationsFromRaw,
  buildClinicalResultTreatmentRequestSpec,
  buildInstitutionAuxiliaryCatalogContext,
  loadAvailableMedicineInventoryContext,
  mapAuxiliaryCatalogRecommendations,
  parseLLMJson,
  type AuxiliaryCatalogRecommendationResponse,
  type ClinicalResultRecommendationType,
  type RawClinicalResultTreatmentRecommendationInput,
} from '@features/clinical-result';

export interface VoiceTreatmentGenerationInput {
  patientName: string;
  gender: string;
  age: string;
  diagnosisName: string;
  diagnosisCode: string;
  chiefComplaint: string;
  clinicalContext: string;
  requestedTypes: ClinicalResultRecommendationType[];
  explicitTreatments: TreatmentRecommendation[];
  pharmacies: PharmacyOption[];
  consultationId: string;
  normalize: (item: Partial<TreatmentRecommendation>) => TreatmentRecommendation;
  onTaskResult?: (result: VoiceTreatmentGenerationTaskResult) => void | Promise<void>;
}

export interface VoiceTreatmentGenerationTaskResult {
  key: 'medication' | 'auxiliary' | 'procedure';
  types: ClinicalResultRecommendationType[];
  items: TreatmentRecommendation[];
  error?: unknown;
}

function createBaseParams(input: VoiceTreatmentGenerationInput) {
  return {
    patientName: input.patientName,
    gender: input.gender,
    age: input.age,
    diagnosisName: input.diagnosisName,
    diagnosisCode: input.diagnosisCode,
    chiefComplaint: input.chiefComplaint,
    clinicalContext: input.clinicalContext,
  };
}

export async function generateVoiceTreatmentRecommendations(
  input: VoiceTreatmentGenerationInput,
): Promise<VoiceTreatmentGenerationTaskResult[]> {
  const requestedSet = new Set(input.requestedTypes);
  requestedSet.delete('procedure');
  const baseParams = createBaseParams(input);
  const runners: Array<{
    key: VoiceTreatmentGenerationTaskResult['key'];
    types: ClinicalResultRecommendationType[];
    run: () => Promise<VoiceTreatmentGenerationTaskResult>;
  }> = [];
  const immediateResults: VoiceTreatmentGenerationTaskResult[] = [];

  if (requestedSet.has('medicine')) {
    runners.push({ key: 'medication', types: ['medicine'], run: async () => {
      const inventory = await loadAvailableMedicineInventoryContext({ pharmacies: input.pharmacies });
      const spec = buildClinicalResultTreatmentRequestSpec('medication', {
        ...baseParams,
        availableMedicineInventory: inventory.promptContext,
      }, PROMPTS.consultation.treatmentRecommendation, {
        consultationId: input.consultationId,
      });
      const response = await chat(spec.messages, undefined, undefined, undefined, spec.config);
      const raw = alignMedicineRecommendationsToInventory(
        parseLLMJson<TreatmentRecommendation[]>(response),
        inventory.items,
      );
      return {
        key: 'medication',
        types: ['medicine'],
        items: buildClinicalResultTreatmentRecommendationsFromRaw({
          rawRecommendations: raw as unknown as RawClinicalResultTreatmentRecommendationInput[],
          type: 'medicine',
          match: assessTreatmentCatalogMatch,
          normalize: input.normalize,
        }),
      };
    } });
  }

  const auxiliaryTypes = input.requestedTypes.filter(
    (type): type is 'exam' | 'lab_test' => type === 'exam' || type === 'lab_test',
  );
  let auxiliaryItems = [] as Awaited<ReturnType<typeof medicalDataService.fetchAvailableExamLabItems>>;
  let auxiliaryCatalogError: unknown;
  if (auxiliaryTypes.length > 0) {
    try {
      auxiliaryItems = await medicalDataService.fetchAvailableExamLabItems();
    } catch (error) {
      auxiliaryCatalogError = error;
      console.warn('[VoiceTreatment] Failed to query available exam/lab items from PHIS', error);
    }
  }
  const auxiliaryCatalog = buildInstitutionAuxiliaryCatalogContext(
    auxiliaryItems,
    auxiliaryTypes,
    {
      includeRestricted: explicitlyRequestsRestrictedMedicalItem([
        input.chiefComplaint,
        input.clinicalContext,
        ...input.explicitTreatments.map((item) => item.name),
      ].join(' ')),
    },
  );
  const availableAuxiliaryTypes = auxiliaryTypes.filter((type) => (
    type === 'exam' ? auxiliaryCatalog.counts.exam > 0 : auxiliaryCatalog.counts.labTest > 0
  ));
  auxiliaryTypes
    .filter((type) => !availableAuxiliaryTypes.includes(type))
    .forEach((type) => immediateResults.push({
      key: 'auxiliary',
      types: [type],
      items: [],
      error: auxiliaryCatalogError || new Error(type === 'exam' ? '当前机构检查目录为空' : '当前机构检验目录为空'),
    }));

  if (availableAuxiliaryTypes.length > 0) {
    runners.push({ key: 'auxiliary', types: availableAuxiliaryTypes, run: async () => {
      const spec = buildClinicalResultTreatmentRequestSpec('exam', {
        ...baseParams,
        availableExamLabCatalog: auxiliaryCatalog.promptContext,
        requestedTypes: availableAuxiliaryTypes,
        explicitItemNames: input.explicitTreatments
          .filter((item) => availableAuxiliaryTypes.includes(item.type as 'exam' | 'lab_test'))
          .map((item) => item.name),
      }, PROMPTS.consultation.auxiliaryCatalogRecommendation, {
        consultationId: input.consultationId,
      }, {
        scene: 'voice-consultation-treatment-auxiliary-catalog',
        operationAction: 'generate_auxiliary_catalog_recommendation',
        title: '语音问诊生成院内目录检验检查推荐',
      });
      const response = await chat(spec.messages, undefined, undefined, undefined, spec.config);
      return {
        key: 'auxiliary',
        types: availableAuxiliaryTypes,
        items: mapAuxiliaryCatalogRecommendations(
          parseLLMJson<AuxiliaryCatalogRecommendationResponse>(response),
          auxiliaryCatalog,
          availableAuxiliaryTypes,
          input.normalize,
        ),
      };
    } });
  }

  if (requestedSet.has('procedure')) {
    runners.push({ key: 'procedure', types: ['procedure'], run: async () => {
      const spec = buildClinicalResultTreatmentRequestSpec('procedure', baseParams, PROMPTS.consultation.procedureRecommendation, {
        consultationId: input.consultationId,
      });
      const response = await chat(spec.messages, undefined, undefined, undefined, spec.config);
      return {
        key: 'procedure',
        types: ['procedure'],
        items: buildClinicalResultTreatmentRecommendationsFromRaw({
          rawRecommendations: parseLLMJson<RawClinicalResultTreatmentRecommendationInput[]>(response),
          type: 'procedure',
          match: assessTreatmentCatalogMatch,
          normalize: input.normalize,
        }),
      };
    } });
  }

  for (const result of immediateResults) {
    await input.onTaskResult?.(result);
  }

  const asyncResults = await Promise.all(runners.map(async (runner) => {
    let result: VoiceTreatmentGenerationTaskResult;
    try {
      result = await runner.run();
    } catch (error) {
      result = {
        key: runner.key,
        types: runner.types,
        items: [],
        error,
      };
    }
    await input.onTaskResult?.(result);
    return result;
  }));
  return [...immediateResults, ...asyncResults];
}
