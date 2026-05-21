import type { Diagnosis, TreatmentRecommendation } from '@/types/consultation';

export interface ClinicalResultDiagnosisCatalogMatch {
  id: string;
  code: string;
  name: string;
}

export interface MapClinicalResultAiDiagnosesInput {
  rawDiagnoses: Diagnosis[];
  matchDiagnosis: (
    query: string,
    context?: { icdCode?: string },
  ) => ClinicalResultDiagnosisCatalogMatch | null;
  lookupOrder?: Array<'name' | 'code'>;
  clearUnmatchedId?: boolean;
}

type ClinicalResultTreatmentCatalogMatch = Pick<
  TreatmentRecommendation,
  'matchedItem' | 'suggestedMatchItem' | 'matchStatus'
>;

export interface RawClinicalResultTreatmentRecommendationInput {
  type?: string;
  name?: string;
  aliases?: unknown;
  spec?: string;
  [key: string]: unknown;
}

export interface MapClinicalResultAiTreatmentsInput {
  rawTreatments: TreatmentRecommendation[];
  assessCatalogMatch: (
    type: TreatmentRecommendation['type'],
    name: string,
    aliases?: string[],
    spec?: string,
  ) => ClinicalResultTreatmentCatalogMatch;
  normalize: (rec: Partial<TreatmentRecommendation>) => TreatmentRecommendation;
}

export interface ClinicalResultAiTreatmentParseFailure {
  error: unknown;
  responsePreview: string;
}

export interface MergeClinicalResultAiTreatmentResponsesInput {
  responses: Array<PromiseSettledResult<string>>;
  parse: (text: string) => TreatmentRecommendation[];
  assessCatalogMatch: MapClinicalResultAiTreatmentsInput['assessCatalogMatch'];
  normalize: MapClinicalResultAiTreatmentsInput['normalize'];
  onParseFailure?: (failure: ClinicalResultAiTreatmentParseFailure) => void;
}

export interface BuildClinicalResultTreatmentRecommendationsInput {
  rawRecommendations: RawClinicalResultTreatmentRecommendationInput[];
  type: TreatmentRecommendation['type'];
  match: MapClinicalResultAiTreatmentsInput['assessCatalogMatch'];
  normalize: MapClinicalResultAiTreatmentsInput['normalize'];
}

export function mapClinicalResultAiDiagnoses(input: MapClinicalResultAiDiagnosesInput): Diagnosis[] {
  const lookupOrder = input.lookupOrder || ['name', 'code'];

  return input.rawDiagnoses.map((diag) => {
    const matchContext = diag.code ? { icdCode: diag.code } : undefined;
    const matched = lookupOrder.reduce<ClinicalResultDiagnosisCatalogMatch | null>((current, field) => {
      if (current) {
        return current;
      }
      if (field === 'name') {
        return input.matchDiagnosis(diag.name, matchContext);
      }
      return input.matchDiagnosis(diag.code);
    }, null);

    if (matched) {
      return {
        ...diag,
        code: matched.code,
        name: matched.name,
        id: matched.id,
      };
    }

    if (input.clearUnmatchedId) {
      return {
        ...diag,
        id: undefined,
      };
    }

    return diag;
  });
}

export function buildClinicalResultTreatmentRecommendationsFromRaw(
  input: BuildClinicalResultTreatmentRecommendationsInput,
): TreatmentRecommendation[] {
  return input.rawRecommendations
    .filter((rec) => !rec.type || rec.type === input.type)
    .map((rec) => {
      const aliases = Array.isArray(rec.aliases) ? (rec.aliases as string[]) : undefined;
      const assessment = input.match(input.type, rec.name || '', aliases, rec.spec);
      return input.normalize({
        ...(rec as Partial<TreatmentRecommendation>),
        aliases,
        type: input.type,
        matchedItem: assessment.matchedItem,
        suggestedMatchItem: assessment.suggestedMatchItem,
        matchStatus: assessment.matchStatus,
        selected: false,
      });
    });
}

export function mapClinicalResultAiTreatments(input: MapClinicalResultAiTreatmentsInput): TreatmentRecommendation[] {
  return input.rawTreatments.map((rec) => {
    const aliases = Array.isArray(rec.aliases) ? rec.aliases : undefined;
    const assessment = input.assessCatalogMatch(
      rec.type,
      rec.name,
      aliases,
      rec.type === 'medicine' ? rec.spec : undefined,
    );
    return input.normalize({
      ...rec,
      aliases,
      originalName: rec.originalName || rec.name,
      matchedItem: assessment.matchedItem,
      suggestedMatchItem: assessment.suggestedMatchItem,
      matchStatus: assessment.matchStatus,
      manualMatched: false,
      selected: assessment.matchStatus === 'exact',
    });
  });
}

export function mergeClinicalResultAiTreatmentResponses(
  input: MergeClinicalResultAiTreatmentResponsesInput,
): TreatmentRecommendation[] {
  return input.responses.flatMap((response) => {
    if (response.status !== 'fulfilled') {
      return [];
    }

    try {
      return mapClinicalResultAiTreatments({
        rawTreatments: input.parse(response.value),
        assessCatalogMatch: input.assessCatalogMatch,
        normalize: input.normalize,
      });
    } catch (error) {
      input.onParseFailure?.({
        error,
        responsePreview: response.value.slice(0, 400),
      });
      return [];
    }
  });
}
