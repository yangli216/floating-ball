import { chat, type ChatMessage } from '@/services/llm';
import type { AnnualChronicAssessment } from '../lib/annualAssessment';
import type {
  AnnualAssessmentDraft,
  AnnualAssessmentEvidenceState,
  AnnualAssessmentFinding,
  AnnualAssessmentPriority,
  AnnualAssessmentSection,
  AnnualAssessmentSectionKey,
  ChronicDiseasePatientSummary,
} from '../types';

interface AiFinding {
  content?: string;
  evidenceRefs?: unknown[];
  evidenceState?: string;
  priority?: string;
}

interface AiSection {
  key?: string;
  summary?: string;
  findings?: AiFinding[];
}

interface AiAnnualAssessment {
  overallSummary?: string;
  sections?: AiSection[];
  missingData?: unknown[];
  doctorReviewPoints?: unknown[];
  safetyNote?: string;
}

interface AnnualAssessmentEvidenceBundle {
  payload: Record<string, unknown>;
  labels: Map<string, string>;
}

const SECTION_DEFINITIONS: ReadonlyArray<{
  key: AnnualAssessmentSectionKey;
  title: string;
}> = [
  { key: 'control-trend', title: '年度控制与趋势' },
  { key: 'cardiovascular-risk', title: '心血管风险与共病' },
  { key: 'complication-screening', title: '并发症与靶器官筛查' },
  { key: 'medication-safety', title: '用药、依从性与安全性' },
  { key: 'lifestyle-management', title: '生活方式与自我管理' },
  { key: 'follow-up-plan', title: '随访重点与管理计划' },
];

const SECTION_KEYS = new Set<AnnualAssessmentSectionKey>(
  SECTION_DEFINITIONS.map((item) => item.key),
);
const EVIDENCE_STATES = new Set<AnnualAssessmentEvidenceState>(['supported', 'insufficient']);
const PRIORITIES = new Set<AnnualAssessmentPriority>(['routine', 'attention']);

function cleanText(value: unknown, maxLength = 320): string {
  return typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim().slice(0, maxLength)
    : '';
}

function cleanTextList(values: unknown[] | undefined, maxItems: number): string[] {
  return Array.from(new Set(
    (values || []).map((item) => cleanText(item, 180)).filter(Boolean),
  )).slice(0, maxItems);
}

function parseJsonObject<T>(text: string): T {
  const cleaned = text.replace(/```json\s*|\s*```/gi, '').trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  return JSON.parse(match?.[0] || cleaned) as T;
}

function formatDate(value: string | undefined): string {
  if (!value) return '日期待核实';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
}

function finding(
  content: string,
  evidence: string,
  evidenceState: AnnualAssessmentEvidenceState,
  priority: AnnualAssessmentPriority,
): AnnualAssessmentFinding {
  return { content, evidence, evidenceState, priority };
}

function isInYear(value: string | undefined, year: number): boolean {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.getFullYear() === year;
}

function buildControlledFallback(
  summary: ChronicDiseasePatientSummary,
  assessment: AnnualChronicAssessment,
): AnnualAssessmentDraft {
  const hasHypertension = summary.diseaseTags.some((item) => item.diseaseType === 'hypertension');
  const hasDiabetes = summary.diseaseTags.some((item) => item.diseaseType === 'type2_diabetes');
  const controlFindings: AnnualAssessmentFinding[] = [];

  if (hasHypertension) {
    controlFindings.push(assessment.latestPressure
      ? finding(
        `本年度共取得 ${assessment.bloodPressurePoints.length} 条血压记录，最近一次为 ${assessment.latestPressure.systolic}/${assessment.latestPressure.diastolic} mmHg；是否达标需结合医生设定的个体目标判断。`,
        `${formatDate(assessment.latestPressure.measuredAt)} · ${assessment.latestPressure.sourceLabel}`,
        'supported',
        'attention',
      )
      : finding(
        '本年度未取得可追溯血压记录，暂不能评价血压控制趋势。',
        '年度血压记录为空',
        'insufficient',
        'attention',
      ));
  }

  if (hasDiabetes) {
    controlFindings.push(assessment.latestGlucose
      ? finding(
        `本年度共取得 ${assessment.bloodGlucosePoints.length} 条结构化血糖记录，最近一次为 ${assessment.latestGlucose.value} mmol/L；仍需结合测量时点、糖化血红蛋白和个体目标评价控制情况。`,
        `${formatDate(assessment.latestGlucose.measuredAt)} · ${assessment.latestGlucose.sourceLabel}`,
        'supported',
        'attention',
      )
      : finding(
        '本年度未取得可解析的结构化血糖记录，暂不能评价血糖控制趋势。',
        '年度血糖记录为空',
        'insufficient',
        'attention',
      ));
  }

  if (controlFindings.length === 0) {
    controlFindings.push(finding(
      '当前未识别到高血压或 2 型糖尿病的可追溯管理标签，需要先核实慢病身份。',
      '慢病标签缺失',
      'insufficient',
      'attention',
    ));
  }

  const annualVitals = isInYear(summary.lastVisitAt, assessment.year)
    ? [
      summary.latestHeightCm ? `身高 ${summary.latestHeightCm} cm` : '',
      summary.latestWeightKg ? `体重 ${summary.latestWeightKg} kg` : '',
      summary.latestWaistCm ? `腰围 ${summary.latestWaistCm} cm` : '',
      summary.latestHeartRate ? `心率 ${summary.latestHeartRate} 次/分` : '',
    ].filter(Boolean)
    : [];

  const medicationNames = Array.from(new Set(
    assessment.medicationFacts.map((item) => item.regimenText
      ? `${item.name}（${item.regimenText}）`
      : item.name),
  ));

  const complicationItems = [
    hasHypertension ? '心、脑、肾、眼等靶器官损害及相关临床疾病记录' : '',
    hasDiabetes ? '糖化血红蛋白、肾功能/尿白蛋白、眼底和足部/神经病变筛查记录' : '',
  ].filter(Boolean);

  const missingData = [
    ...(hasHypertension ? ['个体化血压控制目标与家庭血压监测记录'] : []),
    ...(hasDiabetes ? ['糖化血红蛋白及空腹/餐后血糖的完整年度记录'] : []),
    '血脂、肾功能和尿白蛋白等心肾风险资料',
    ...(complicationItems.length > 0 ? complicationItems : []),
    '吸烟饮酒、饮食、运动、睡眠和体重变化资料',
    '用药依从性、不良反应、低血糖或体位性症状记录',
  ];

  const sections: AnnualAssessmentSection[] = [
    {
      key: 'control-trend',
      title: '年度控制与趋势',
      summary: '仅陈述本年度可追溯测量，不以通用阈值替代个体控制目标。',
      findings: controlFindings,
    },
    {
      key: 'cardiovascular-risk',
      title: '心血管风险与共病',
      summary: annualVitals.length > 0
        ? '已取得部分年度体格指标，但完整心血管风险分层资料仍不足。'
        : '当前年度证据不足以完成心血管风险与共病评估。',
      findings: [
        finding(
          annualVitals.length > 0
            ? `最近一次年度随访体格记录：${annualVitals.join('，')}。`
            : '本年度缺少有明确日期的体重、腰围或心率等体格记录。',
          annualVitals.length > 0 ? `${formatDate(summary.lastVisitAt)} · 慢病随访` : '年度体格记录不足',
          annualVitals.length > 0 ? 'supported' : 'insufficient',
          'routine',
        ),
        finding(
          '血脂、吸烟史、心脑血管病史和肾功能等资料未完整进入当前评估，需由医生补充后分层。',
          '当前输入未提供完整风险分层字段',
          'insufficient',
          'attention',
        ),
      ],
    },
    {
      key: 'complication-screening',
      title: '并发症与靶器官筛查',
      summary: '当前未获得完整筛查结果，不能把“无记录”解释为“结果正常”或“已完成”。',
      findings: complicationItems.length > 0
        ? complicationItems.map((item) => finding(
          `待核实：${item}。`,
          '当前输入无对应结构化结果',
          'insufficient',
          'attention',
        ))
        : [finding(
          '需先核实慢病病种，再确定相应并发症与靶器官筛查范围。',
          '慢病身份信息不足',
          'insufficient',
          'attention',
        )],
    },
    {
      key: 'medication-safety',
      title: '用药、依从性与安全性',
      summary: medicationNames.length > 0
        ? '已取得有日期的历史用药事实，但不等于当前处方或患者正在按方案服用。'
        : '本年度未取得有日期的用药事实。',
      findings: [
        finding(
          medicationNames.length > 0
            ? `本年度可追溯用药事实：${medicationNames.slice(0, 6).join('、')}。`
            : '需要核对当前实际用药、剂量、频次和来源。',
          medicationNames.length > 0 ? `${assessment.medicationFacts.length} 项年度用药事实` : '年度用药事实为空',
          medicationNames.length > 0 ? 'supported' : 'insufficient',
          'attention',
        ),
        finding(
          '依从性、不良反应、漏服、低血糖及体位性不适等信息待医生问诊核实；本评估不自动新增、停用或调整药物。',
          '当前输入未提供依从性和安全性记录',
          'insufficient',
          'attention',
        ),
      ],
    },
    {
      key: 'lifestyle-management',
      title: '生活方式与自我管理',
      summary: '当前证据未覆盖生活方式执行情况，不能生成患者已经做到或未做到的结论。',
      findings: [
        finding(
          '待核实吸烟饮酒、饮食结构与盐摄入、运动、睡眠、体重管理及家庭监测执行情况。',
          '当前输入未提供生活方式结构化事实',
          'insufficient',
          'routine',
        ),
      ],
    },
    {
      key: 'follow-up-plan',
      title: '随访重点与管理计划',
      summary: '先补齐关键证据，再由医生结合个体目标确定复查、随访或转诊安排。',
      findings: [
        finding(
          `优先复核本年度控制指标、并发症筛查、实际用药和生活方式资料；当前数据截至 ${assessment.latestDataAt ? formatDate(assessment.latestDataAt) : '待核实'}。`,
          '基于当前年度数据覆盖情况',
          'supported',
          'attention',
        ),
        finding(
          '下一次随访时间、检查项目和处置方案由医生结合症状、个体目标及真实检查结果确认。',
          'AI 不代替临床处置决策',
          'insufficient',
          'routine',
        ),
      ],
    },
  ];

  return {
    generatedAt: new Date().toISOString(),
    year: assessment.year,
    source: 'controlled-fallback',
    overallSummary: `已基于 ${assessment.year} 年可追溯事实形成完整评估框架；当前记录覆盖有限，结论以数据缺口和医生复核为主。`,
    sections,
    missingData: Array.from(new Set(missingData)).slice(0, 10),
    doctorReviewPoints: [
      '核对患者慢病身份、个体控制目标和年度测量时点。',
      '补齐心血管危险因素、共病及靶器官/并发症筛查结果。',
      '核对当前实际用药、依从性、不良反应和近期方案变化。',
      '确认可执行的生活方式目标、家庭监测方式和复核时间。',
      '结合症状和真实检查结果决定复查、随访或转诊安排。',
    ],
    safetyNote: '本内容是医生确认前的慢病年度评估草稿，不替代诊断、处方、急症处置或个体化随访决策。',
  };
}

function sanitizeFinding(
  raw: AiFinding,
  evidenceLabels: Map<string, string>,
): AnnualAssessmentFinding | null {
  const content = cleanText(raw.content);
  const evidenceRefs = cleanTextList(raw.evidenceRefs, 4)
    .filter((reference) => evidenceLabels.has(reference));
  if (!content || evidenceRefs.length === 0) return null;
  const evidenceState = cleanText(raw.evidenceState, 32) as AnnualAssessmentEvidenceState;
  const priority = cleanText(raw.priority, 32) as AnnualAssessmentPriority;
  return {
    content,
    evidence: evidenceRefs.map((reference) => evidenceLabels.get(reference)).join('；'),
    evidenceState: EVIDENCE_STATES.has(evidenceState) ? evidenceState : 'insufficient',
    priority: PRIORITIES.has(priority) ? priority : 'routine',
  };
}

function sanitizeAiAssessment(
  raw: AiAnnualAssessment,
  fallback: AnnualAssessmentDraft,
  evidenceLabels: Map<string, string>,
): AnnualAssessmentDraft {
  const aiSections = new Map<AnnualAssessmentSectionKey, AiSection>();
  (raw.sections || []).forEach((section) => {
    const key = cleanText(section.key, 48) as AnnualAssessmentSectionKey;
    if (SECTION_KEYS.has(key) && !aiSections.has(key)) aiSections.set(key, section);
  });

  if (aiSections.size === 0) return fallback;

  const fallbackSections = new Map(fallback.sections.map((section) => [section.key, section]));
  const sections = SECTION_DEFINITIONS.map(({ key, title }): AnnualAssessmentSection => {
    const fallbackSection = fallbackSections.get(key)!;
    const rawSection = aiSections.get(key);
    if (!rawSection) return fallbackSection;
    const findings = (rawSection.findings || [])
      .map((item) => sanitizeFinding(item, evidenceLabels))
      .filter((item): item is AnnualAssessmentFinding => Boolean(item))
      .slice(0, 4);
    return {
      key,
      title,
      summary: cleanText(rawSection.summary) || fallbackSection.summary,
      findings: findings.length > 0 ? findings : fallbackSection.findings,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    year: fallback.year,
    source: 'ai',
    overallSummary: cleanText(raw.overallSummary, 420) || fallback.overallSummary,
    sections,
    missingData: cleanTextList(raw.missingData, 10).length > 0
      ? cleanTextList(raw.missingData, 10)
      : fallback.missingData,
    doctorReviewPoints: cleanTextList(raw.doctorReviewPoints, 8).length > 0
      ? cleanTextList(raw.doctorReviewPoints, 8)
      : fallback.doctorReviewPoints,
    safetyNote: cleanText(raw.safetyNote, 300) || fallback.safetyNote,
  };
}

function buildEvidence(
  summary: ChronicDiseasePatientSummary,
  assessment: AnnualChronicAssessment,
): AnnualAssessmentEvidenceBundle {
  const annualVitals = isInYear(summary.lastVisitAt, assessment.year)
    ? {
      measuredAt: summary.lastVisitAt,
      heightCm: summary.latestHeightCm,
      weightKg: summary.latestWeightKg,
      waistCm: summary.latestWaistCm,
      heartRate: summary.latestHeartRate,
    }
    : null;

  const missingDomains = [
    '个体化控制目标',
    '糖化血红蛋白',
    '血脂',
    '肾功能与尿白蛋白',
    '眼底与足部/神经筛查',
    '吸烟饮酒、饮食、运动与睡眠',
    '用药依从性、不良反应、低血糖或体位性症状',
  ];
  const items: Array<Record<string, unknown>> = [
    {
      id: 'patient-profile',
      type: 'patient-profile',
      value: { gender: summary.gender, ageText: summary.ageText },
    },
    {
      id: 'disease-context',
      type: 'disease-context',
      value: {
        contractLabel: summary.contractLabel,
        diseaseTags: summary.diseaseTags.map((item) => ({
          diseaseType: item.diseaseType,
          label: item.label,
          source: item.source,
        })),
        diagnosisText: summary.diagnosisText,
      },
    },
    ...assessment.bloodPressurePoints.map((point, index) => ({
      id: `blood-pressure-${index + 1}`,
      type: 'blood-pressure',
      value: point,
    })),
    ...assessment.bloodGlucosePoints.map((point, index) => ({
      id: `blood-glucose-${index + 1}`,
      type: 'blood-glucose',
      value: point,
    })),
    ...assessment.medicationFacts.map((item, index) => ({
      id: `medication-${index + 1}`,
      type: 'medication-fact',
      value: {
        name: item.name,
        regimenText: item.regimenText,
        observedAt: item.observedAt,
        sourceLabel: item.sourceLabel,
      },
    })),
    ...(annualVitals ? [{
      id: 'annual-vitals',
      type: 'annual-vitals',
      value: annualVitals,
    }] : []),
    {
      id: 'data-coverage',
      type: 'data-coverage',
      value: {
        bloodPressureCount: assessment.bloodPressurePoints.length,
        bloodGlucoseCount: assessment.bloodGlucosePoints.length,
        medicationFactCount: assessment.medicationFacts.length,
        latestDataAt: assessment.latestDataAt,
        sourceQuality: summary.sourceQuality,
        missingDomains,
      },
    },
  ];

  const labels = new Map<string, string>();
  labels.set('patient-profile', `基本信息：${summary.gender}，${summary.ageText}`);
  labels.set('disease-context', `慢病背景：${summary.diseaseTags.map((item) => item.label).join('、') || '未识别'}；${summary.diagnosisText}`);
  assessment.bloodPressurePoints.forEach((point, index) => {
    labels.set(
      `blood-pressure-${index + 1}`,
      `${formatDate(point.measuredAt)} 血压 ${point.systolic}/${point.diastolic} mmHg · ${point.sourceLabel}`,
    );
  });
  assessment.bloodGlucosePoints.forEach((point, index) => {
    labels.set(
      `blood-glucose-${index + 1}`,
      `${formatDate(point.measuredAt)} 血糖 ${point.value} mmol/L · ${point.sourceLabel}`,
    );
  });
  assessment.medicationFacts.forEach((item, index) => {
    labels.set(
      `medication-${index + 1}`,
      `${formatDate(item.observedAt)} 用药事实：${item.name}${item.regimenText ? `（${item.regimenText}）` : ''} · ${item.sourceLabel}`,
    );
  });
  if (annualVitals) {
    labels.set('annual-vitals', `${formatDate(summary.lastVisitAt)} 年度随访体格记录`);
  }
  labels.set(
    'data-coverage',
    `数据覆盖：血压 ${assessment.bloodPressurePoints.length} 条、血糖 ${assessment.bloodGlucosePoints.length} 条、用药 ${assessment.medicationFacts.length} 项；其余列明领域当前未提供`,
  );

  return {
    payload: {
      assessmentYear: assessment.year,
      evidenceItems: items,
    },
    labels,
  };
}

export async function generateAnnualAssessmentDraft(
  summary: ChronicDiseasePatientSummary,
  assessment: AnnualChronicAssessment,
): Promise<AnnualAssessmentDraft> {
  const fallback = buildControlledFallback(summary, assessment);
  const evidence = buildEvidence(summary, assessment);
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: [
        '你是基层慢病医生的年度健康评估草稿助手，仅服务高血压与 2 型糖尿病。',
        '只能使用输入中的可追溯患者事实。缺失信息必须写“待核实”或“当前未取得记录”，不得推断为正常、已完成或患者未执行。',
        '血压、血糖只能描述本年度记录、变化和数据覆盖；不得用通用阈值代替医生为患者设定的个体控制目标。',
        '不得虚构糖化血红蛋白、血脂、肾功能、尿白蛋白、眼底、足部、心脑血管病史、吸烟饮酒、饮食运动、依从性、不良反应或任何检查结果。',
        '不得自动诊断、开药、停药、调药、确定转诊或急症处置，不得修改已发布临床规则。',
        '必须覆盖 6 个 section key：control-trend、cardiovascular-risk、complication-screening、medication-safety、lifestyle-management、follow-up-plan。',
        '每个 section 输出 1-4 条 finding；每条 finding 必须提供 evidenceRefs，且只能引用输入 evidenceItems 中真实存在的 id。',
        'evidenceState 只能是 supported 或 insufficient，priority 只能是 routine 或 attention。',
        '仅返回 JSON：{"overallSummary":"","sections":[{"key":"","summary":"","findings":[{"content":"","evidenceRefs":["evidence-id"],"evidenceState":"supported|insufficient","priority":"routine|attention"}]}],"missingData":[""],"doctorReviewPoints":[""],"safetyNote":""}',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `年度患者证据：${JSON.stringify(evidence.payload)}`,
        '请形成内容完整、证据可追溯且便于医生复核的年度慢病评估草稿。',
      ].join('\n'),
    },
  ];

  try {
    const response = await chat(messages, undefined, undefined, undefined, {
      traceContext: {
        scene: 'chronic-annual-assessment',
        sourceModule: 'chronic_disease',
        operationModule: 'chronic_disease',
        operationAction: 'generate_annual_assessment',
        title: '生成慢病年度健康评估',
        consultationId: summary.idRecord || summary.idPhr,
      },
    });
    return sanitizeAiAssessment(
      parseJsonObject<AiAnnualAssessment>(response),
      fallback,
      evidence.labels,
    );
  } catch (error) {
    console.warn('[AnnualAssessment] AI generation failed, using controlled fallback:', error);
    return fallback;
  }
}
