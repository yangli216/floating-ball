import type {
  ClinicalResultMatchedDiagnosis as MatchedDiagnosis,
  ClinicalResultMatchedTreatment as MatchedTreatment,
} from './clinicalResultContract';

export interface ClinicalResultRecordSummaryInput {
  chiefComplaint?: string;
  historyOfPresentIllness?: string;
}

export function normalizeAnalysisText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/^[“"'`]+|[”"'`]+$/g, '')
    .replace(/^(分析依据|模型分析|医生口述诊断|医生口述)[:：\s]*/u, '')
    .trim();
}

export function truncateAnalysisText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

export function buildEncounterSummary(input: ClinicalResultRecordSummaryInput): string {
  const complaint = truncateAnalysisText(normalizeAnalysisText(input.chiefComplaint || ''), 24);
  const history = truncateAnalysisText(normalizeAnalysisText(input.historyOfPresentIllness || ''), 32);

  if (complaint && history) return `结合主诉“${complaint}”及现病史“${history}”`;
  if (complaint) return `结合主诉“${complaint}”`;
  if (history) return `结合现病史“${history}”`;
  return '结合当前问诊信息';
}

export function buildDiagnosisRationale(
  matchedDiagnosis: MatchedDiagnosis,
  displayName: string,
  record: ClinicalResultRecordSummaryInput,
): string {
  const summary = buildEncounterSummary(record);
  const evidenceText = normalizeAnalysisText(matchedDiagnosis.evidenceText || '').replace(/[。；;，,]+$/u, '');
  const rationaleText = normalizeAnalysisText(matchedDiagnosis.rationale || '').replace(/[。；;，,]+$/u, '');
  const sourceText = matchedDiagnosis.sourceType === 'inferred'
    ? '该诊断为模型结合完整对话推断得出'
    : matchedDiagnosis.sourceType === 'uncertain'
      ? '该诊断为信息不足时的谨慎提示'
      : '该诊断在对话中有明确依据';
  const matchNote = matchedDiagnosis.matchedItem ? '' : '当前标准库中暂未匹配到完全一致的诊断条目，需人工确认。';
  const rationaleBody = rationaleText || `${sourceText}，建议结合查体和必要检查进一步确认。`;
  if (evidenceText) {
    return `${summary}，模型初步考虑${displayName}，依据为“${evidenceText}”。${rationaleBody}${matchNote}`;
  }
  return `${summary}，模型初步考虑${displayName}。${rationaleBody}${matchNote}`;
}

export function getTreatmentEvidenceCorpus(
  item: Pick<MatchedTreatment, 'name' | 'evidenceText' | 'text' | 'goal'>,
): string {
  return normalizeAnalysisText([item.name, item.evidenceText, item.text, item.goal].filter(Boolean).join(' '));
}

export function isConditionalMedicine(item: MatchedTreatment): boolean {
  const corpus = getTreatmentEvidenceCorpus(item);
  return /如果|若|待|查完|结果出来|结果回报|明确后|必要时|再用|再考虑|细菌感染就|病毒感染就|视情况/u.test(corpus);
}

export function isHistoricalSelfMedication(item: MatchedTreatment): boolean {
  const corpus = getTreatmentEvidenceCorpus(item);
  return /吃了|已服用|已经服用|自行服用|自服|服用过|在家服用|院外已用/u.test(corpus);
}

export function buildTreatmentReason(
  item: MatchedTreatment,
  displayName: string,
  record: ClinicalResultRecordSummaryInput,
): string {
  const summary = buildEncounterSummary(record);
  const normalizedBasis = normalizeAnalysisText(item.evidenceText || item.text || '').replace(/[。；;，,]+$/u, '');
  const goalText = normalizeAnalysisText(item.goal || '').replace(/[。；;，,]+$/u, '');

  if (item.type === 'medicine' && isConditionalMedicine(item)) {
    return `${summary}，${displayName}属于需结合检验或后续评估再决定的条件性用药，当前不建议默认纳入处方。${normalizedBasis ? `依据：${normalizedBasis}。` : ''}`;
  }

  if (item.type === 'medicine' && isHistoricalSelfMedication(item)) {
    return `${summary}，${displayName}主要来自患者已自行服药信息，当前更适合作为用药史参考，不默认继续纳入处方。${normalizedBasis ? `依据：${normalizedBasis}。` : ''}`;
  }

  const sourceText = item.sourceType === 'inferred'
    ? '该项为模型结合病情补全的建议'
    : item.sourceType === 'uncertain'
      ? '该项为信息不足时的谨慎提示'
      : '该项在对话中有明确依据';
  if (normalizedBasis && goalText) {
    return `${summary}，模型建议将${displayName}纳入当前处理方案，主要依据是${normalizedBasis}，处理目标为${goalText}。${sourceText}。`;
  }
  if (normalizedBasis) {
    return `${summary}，模型建议将${displayName}纳入当前处理方案，主要依据是${normalizedBasis}。${sourceText}。`;
  }
  if (goalText) {
    return `${summary}，模型建议将${displayName}纳入当前处理方案，处理目标为${goalText}。${sourceText}。`;
  }
  return `${summary}，模型建议将${displayName}纳入当前处理方案。${sourceText}。`;
}

export function shouldAutoSelectTreatment(item: MatchedTreatment): boolean {
  if (!item.matchedItem) {
    return false;
  }

  if (item.type !== 'medicine') {
    return item.sourceType !== 'uncertain';
  }

  if (item.sourceType === 'uncertain') {
    return false;
  }

  if (isConditionalMedicine(item) || isHistoricalSelfMedication(item)) {
    return false;
  }

  return true;
}
