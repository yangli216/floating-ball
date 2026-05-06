import { PROMPTS } from '../prompts';
import { chat, type ChatMessage } from './llm';
import type {
  DiagnosisPathContext,
  DiagnosisPathOption,
} from '../types/consultationAssist';
import { medicalDataService } from './medicalData';

export interface DiagnosisPathNode {
  name: string;
  depth?: number;
  itemStyle?: {
    color?: string;
  };
}

export interface DiagnosisPathLink {
  source: string;
  target: string;
  value: number;
}

export interface DiagnosisPathAlternative {
  name: string;
  code?: string;
  rate?: string;
  rationale?: string;
}

export interface DiagnosisPathPayload {
  patientName: string;
  diagnosisName: string;
  diagnosisCode: string;
  diagnosisRate: string;
  chapterTitle: string;
  chapterRange?: string;
  summary: string;
  rationale: string;
  supportingEvidence?: string[];
  counterEvidence?: string[];
  differentialPoints?: string[];
  facts: string[];
  alternatives: DiagnosisPathAlternative[];
  nodes: DiagnosisPathNode[];
  links: DiagnosisPathLink[];
  generatedAt: string;
}

interface DiagnosisPathLLMResponse {
  summary?: string;
  chapterTitle?: string;
  chapterRange?: string;
  facts?: string[];
  rationale?: string;
  supportingEvidence?: string[] | string;
  counterEvidence?: string[] | string;
  differentialPoints?: string[] | string;
  nodes?: Array<{
    name?: string;
    depth?: number;
  }>;
  links?: Array<{
    source?: string;
    target?: string;
    value?: number | string;
  }>;
  alternatives?: Array<{
    name?: string;
    code?: string;
    rate?: string;
    rationale?: string;
  }>;
}

const FACT_NODE_COLORS = ['#7b8798', '#8f8bf3', '#7a6ff0', '#49b99a', '#f3a55a'];
const GROUP_NODE_COLOR = '#ef6aa8';
const SUPPORT_NODE_COLOR = '#9d6bff';
const PRIMARY_NODE_COLOR = '#4d8dff';
const ALTERNATIVE_NODE_COLOR = '#9dbcf7';

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function cleanJsonEnvelope(response: string): string {
  return response.replace(/```json\n?|\n?```|```\n?/g, '').trim();
}

function extractJsonObject<T>(response: string): T {
  const clean = cleanJsonEnvelope(response);
  const match = clean.match(/\{[\s\S]*\}/);
  const target = match ? match[0] : clean;
  return JSON.parse(target);
}

function splitToFacts(text: string): string[] {
  return text
    .split(/[，。,；;、\n]/)
    .map((item) => normalizeText(item))
    .filter((item) => item.length >= 2 && item !== '尚未填写主诉' && item !== '尚未填写现病史');
}

function ensureDistinctNames(items: string[]): string[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item)) {
      return false;
    }
    seen.add(item);
    return true;
  });
}

function formatDiagnosisLabel(name: string, code?: string): string {
  return code ? `${name}（${code}）` : name;
}

function splitSectionItems(value: string): string[] {
  return value
    .split(/[，。,；;、\n]/)
    .map((item) => normalizeText(item))
    .filter((item) => item.length >= 2);
}

function normalizeSectionItems(value: string[] | string | undefined, fallback: string[]): string[] {
  const source = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
  const normalized = ensureDistinctNames(
    source.flatMap((item) => splitSectionItems(item)).map((item) => normalizeText(item)).filter(Boolean)
  );
  return normalized.length > 0 ? normalized.slice(0, 4) : fallback;
}

function buildFacts(context: DiagnosisPathContext, diagnosisName: string): string[] {
  const facts: string[] = [];

  if (context.age && context.age !== '未知年龄') {
    facts.push(context.age);
  }

  const chiefComplaint = normalizeText(context.chiefComplaint);
  if (chiefComplaint && chiefComplaint !== '尚未填写主诉') {
    facts.push(chiefComplaint);
  }

  for (const item of splitToFacts(context.historyOfPresentIllness)) {
    if (!facts.includes(item)) {
      facts.push(item);
    }
    if (facts.length >= 5) {
      break;
    }
  }

  if (
    context.allergyHistory &&
    context.allergyHistory !== '未提供过敏史' &&
    (diagnosisName.includes('过敏') || diagnosisName.includes('荨麻疹'))
  ) {
    facts.push(`过敏史：${context.allergyHistory}`);
  }

  return facts.slice(0, 5);
}

function buildFallbackExplanationSections(
  selected: DiagnosisPathOption,
  chapterTitle: string,
  chapterRange: string | undefined,
  facts: string[],
  alternatives: DiagnosisPathAlternative[]
): Pick<
  DiagnosisPathPayload,
  'supportingEvidence' | 'counterEvidence' | 'differentialPoints'
> {
  const factSummary = facts.length > 0 ? facts.slice(0, 3).join('；') : '当前病史摘要较少';
  const supportItems = ensureDistinctNames(
    [
      `患者关键事实：${factSummary}`,
      `章节归类：${chapterTitle}${chapterRange ? `（${chapterRange}）` : ''}`,
      selected.description
        ? `目标诊断依据：${selected.description}`
        : `目标诊断符合率：${selected.meta || '未提供'}`,
    ].filter(Boolean)
  );

  const counterItems = ensureDistinctNames(
    alternatives.length > 0
      ? alternatives.map((alternative) => {
          const label = formatDiagnosisLabel(alternative.name, alternative.code);
          return alternative.rationale
            ? `仍需排除 ${label}：${alternative.rationale}`
            : `仍需排除 ${label}，需结合体征和检查结果进一步确认`;
        })
      : ['当前记录未见明确反证，仍需结合体征、实验室或影像进一步确认。']
  ).slice(0, 3);

  const differentialItems = ensureDistinctNames(
    alternatives.length > 0
      ? alternatives.map((alternative) => {
          const label = formatDiagnosisLabel(alternative.name, alternative.code);
          return alternative.rationale
            ? `与 ${label} 鉴别：${alternative.rationale}`
            : `与 ${label} 鉴别时重点比较症状分布、体征和检查结果`;
        })
      : [
          chapterRange
            ? `优先在 ${chapterTitle}（${chapterRange}）内继续做相近疾病鉴别`
            : `优先在 ${chapterTitle} 内继续做相近疾病鉴别`,
        ]
  ).slice(0, 3);

  return {
    supportingEvidence: supportItems.slice(0, 4),
    counterEvidence: counterItems.length > 0 ? counterItems : ['当前记录未见明确反证，仍需结合体征、实验室或影像进一步确认。'],
    differentialPoints: differentialItems.length > 0 ? differentialItems : ['结合症状分布、体征和检查结果继续鉴别。'],
  };
}

function rateToWeight(rate?: string, fallback = 72): number {
  const parsed = Number.parseFloat((rate || '').replace('%', ''));
  const safe = Number.isFinite(parsed) ? parsed : fallback;
  return Math.max(16, Math.round(safe));
}

function decorateNodes(
  nodes: DiagnosisPathNode[],
  facts: string[],
  primaryNodeName: string
): DiagnosisPathNode[] {
  return nodes.map((node) => {
    if (facts.includes(node.name)) {
      const factIndex = facts.findIndex((item) => item === node.name);
      return {
        ...node,
        itemStyle: { color: FACT_NODE_COLORS[factIndex % FACT_NODE_COLORS.length] },
      };
    }

    if (node.name === primaryNodeName) {
      return {
        ...node,
        itemStyle: { color: PRIMARY_NODE_COLOR },
      };
    }

    if ((node.depth ?? 0) === 1 && node.name.includes('证据')) {
      return {
        ...node,
        itemStyle: { color: SUPPORT_NODE_COLOR },
      };
    }

    if ((node.depth ?? 0) === 1) {
      return {
        ...node,
        itemStyle: { color: GROUP_NODE_COLOR },
      };
    }

    if ((node.depth ?? 0) === 2) {
      return {
        ...node,
        itemStyle: { color: ALTERNATIVE_NODE_COLOR },
      };
    }

    return node;
  });
}

function buildFallbackDiagnosisPathPayload(
  context: DiagnosisPathContext,
  options: DiagnosisPathOption[],
  preferredOptionId?: string
): DiagnosisPathPayload | null {
  if (!options.length) {
    return null;
  }

  const selected =
    options.find((option) => option.id === preferredOptionId) ||
    options.find((option) => option.selected) ||
    options[0];

  if (!selected) {
    return null;
  }

  const category = medicalDataService.getIcd10CategoryInfo(selected.code || '');
  const chapterTitle = category?.title || '待进一步归类';
  const chapterRange = category?.range;
  const facts = ensureDistinctNames(buildFacts(context, selected.title));
  const alternatives = options
    .filter((option) => option.id !== selected.id)
    .slice(0, 2)
    .map((option) => ({
      name: option.title,
      code: option.code,
      rate: option.meta,
      rationale: option.description,
    }));

  const systemNode = chapterRange ? `${chapterTitle} (${chapterRange})` : chapterTitle;
  const supportNode = '关键证据归集';
  const selectedNode = selected.code ? `${selected.title} (${selected.code})` : selected.title;
  const explanationSections = buildFallbackExplanationSections(
    selected,
    chapterTitle,
    chapterRange,
    facts,
    alternatives
  );

  const nodes: DiagnosisPathNode[] = facts.map((fact, index) => ({
    name: fact,
    depth: 0,
    itemStyle: { color: FACT_NODE_COLORS[index % FACT_NODE_COLORS.length] },
  }));

  nodes.push(
    { name: systemNode, depth: 1, itemStyle: { color: GROUP_NODE_COLOR } },
    { name: supportNode, depth: 1, itemStyle: { color: SUPPORT_NODE_COLOR } },
    { name: selectedNode, depth: 2, itemStyle: { color: PRIMARY_NODE_COLOR } }
  );

  alternatives.forEach((alternative) => {
    nodes.push({
      name: alternative.code ? `${alternative.name} (${alternative.code})` : alternative.name,
      depth: 2,
      itemStyle: { color: ALTERNATIVE_NODE_COLOR },
    });
  });

  const primaryWeight = rateToWeight(selected.meta);
  const links: DiagnosisPathLink[] = facts.flatMap((fact, index) => {
    const baseWeight = Math.max(10, primaryWeight - (index * 8));
    return [
      { source: fact, target: systemNode, value: baseWeight },
      { source: fact, target: supportNode, value: Math.max(8, baseWeight - 4) },
    ];
  });

  links.push(
    { source: systemNode, target: supportNode, value: Math.max(18, primaryWeight - 8) },
    { source: supportNode, target: selectedNode, value: primaryWeight }
  );

  alternatives.forEach((alternative, index) => {
    const alternativeNode = alternative.code ? `${alternative.name} (${alternative.code})` : alternative.name;
    const alternativeWeight = Math.max(
      8,
      Math.round(rateToWeight(alternative.rate, primaryWeight * 0.72) * (0.72 - index * 0.08))
    );
    links.push({ source: systemNode, target: alternativeNode, value: alternativeWeight });
  });

  const summaryParts = [
    context.age && context.age !== '未知年龄' ? `${context.age}` : '',
    normalizeText(context.chiefComplaint) && context.chiefComplaint !== '尚未填写主诉'
      ? `主诉提示“${normalizeText(context.chiefComplaint)}”`
      : '',
    `先归入“${chapterTitle}”相关线索`,
    `再结合证据汇聚到“${selected.title}”`,
  ].filter(Boolean);

  return {
    patientName: context.patientName,
    diagnosisName: selected.title,
    diagnosisCode: selected.code || '',
    diagnosisRate: selected.meta || '',
    chapterTitle,
    chapterRange,
    summary: `${summaryParts.join('，')}。`,
    rationale: selected.description || '当前未返回详细诊断依据。',
    supportingEvidence: explanationSections.supportingEvidence,
    counterEvidence: explanationSections.counterEvidence,
    differentialPoints: explanationSections.differentialPoints,
    facts,
    alternatives,
    nodes,
    links,
    generatedAt: new Date().toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }),
  };
}

function sanitizeLLMResponse(
  llmResponse: DiagnosisPathLLMResponse,
  fallback: DiagnosisPathPayload
): DiagnosisPathPayload | null {
  const fallbackPrimaryNodeName = fallback.diagnosisCode
    ? `${fallback.diagnosisName} (${fallback.diagnosisCode})`
    : fallback.diagnosisName;

  const facts = ensureDistinctNames(
    (Array.isArray(llmResponse.facts) ? llmResponse.facts : [])
      .map((item) => normalizeText(item || ''))
      .filter(Boolean)
  ).slice(0, 5);

  const rawNodes = Array.isArray(llmResponse.nodes) ? llmResponse.nodes : [];
  const nodes = rawNodes
    .map((node) => ({
      name: normalizeText(node?.name || ''),
      depth: [0, 1, 2].includes(Number(node?.depth)) ? Number(node?.depth) : undefined,
    }))
    .filter((node) => node.name);

  const uniqueNodeNames = ensureDistinctNames(nodes.map((node) => node.name));
  const sanitizedNodes: DiagnosisPathNode[] = uniqueNodeNames.map((name) => {
    const source = nodes.find((node) => node.name === name);
    return {
      name,
      depth: source?.depth,
    };
  });

  const nodeNameSet = new Set(sanitizedNodes.map((node) => node.name));
  const links = (Array.isArray(llmResponse.links) ? llmResponse.links : [])
    .map((link) => ({
      source: normalizeText(link?.source || ''),
      target: normalizeText(link?.target || ''),
      value: Math.round(Number(link?.value)),
    }))
    .filter((link) =>
      link.source &&
      link.target &&
      Number.isFinite(link.value) &&
      link.value > 0 &&
      nodeNameSet.has(link.source) &&
      nodeNameSet.has(link.target)
    )
    .map((link) => ({
      ...link,
      value: Math.min(100, Math.max(1, link.value)),
    }));

  if (sanitizedNodes.length < 4 || links.length < 3) {
    return null;
  }

  const chapterTitle = normalizeText(llmResponse.chapterTitle || fallback.chapterTitle) || fallback.chapterTitle;
  const chapterRange = normalizeText(llmResponse.chapterRange || fallback.chapterRange || '');
  const summary = normalizeText(llmResponse.summary || fallback.summary) || fallback.summary;
  const rationale = normalizeText(llmResponse.rationale || fallback.rationale) || fallback.rationale;
  const supportingEvidence = normalizeSectionItems(
    llmResponse.supportingEvidence,
    fallback.supportingEvidence || []
  );
  const counterEvidence = normalizeSectionItems(
    llmResponse.counterEvidence,
    fallback.counterEvidence || []
  );
  const differentialPoints = normalizeSectionItems(
    llmResponse.differentialPoints,
    fallback.differentialPoints || []
  );
  const alternatives = (Array.isArray(llmResponse.alternatives) ? llmResponse.alternatives : [])
    .map((item) => ({
      name: normalizeText(item?.name || ''),
      code: normalizeText(item?.code || ''),
      rate: normalizeText(item?.rate || ''),
      rationale: normalizeText(item?.rationale || ''),
    }))
    .filter((item) => item.name)
    .slice(0, 2);

  return {
    ...fallback,
    chapterTitle,
    chapterRange: chapterRange || fallback.chapterRange,
    summary,
    rationale,
    supportingEvidence,
    counterEvidence,
    differentialPoints,
    facts: facts.length > 0 ? facts : fallback.facts,
    alternatives: alternatives.length > 0 ? alternatives : fallback.alternatives,
    nodes: decorateNodes(
      sanitizedNodes,
      facts.length > 0 ? facts : fallback.facts,
      sanitizedNodes.some((node) => node.name === fallbackPrimaryNodeName)
        ? fallbackPrimaryNodeName
        : fallback.nodes.find((node) => node.itemStyle?.color === PRIMARY_NODE_COLOR)?.name || fallbackPrimaryNodeName
    ),
    links,
    generatedAt: new Date().toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }),
  };
}

async function fetchDiagnosisPathFromLLM(
  context: DiagnosisPathContext,
  options: DiagnosisPathOption[],
  preferredOptionId: string | undefined,
  fallback: DiagnosisPathPayload
): Promise<DiagnosisPathPayload | null> {
  const selected =
    options.find((option) => option.id === preferredOptionId) ||
    options.find((option) => option.selected) ||
    options[0];

  if (!selected) {
    return null;
  }

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: PROMPTS.consultation.diagnosisPathReasoning.system,
    },
    {
      role: 'user',
      content: PROMPTS.consultation.diagnosisPathReasoning.buildUserPrompt({
        patientName: context.patientName,
        gender: context.gender,
        age: context.age,
        chiefComplaint: context.chiefComplaint,
        historyOfPresentIllness: context.historyOfPresentIllness,
        allergyHistory: context.allergyHistory,
        selectedDiagnosisName: selected.title,
        selectedDiagnosisCode: selected.code,
        selectedDiagnosisRate: selected.meta,
        selectedDiagnosisRationale: selected.description,
        candidateDiagnoses: options.map((option) => ({
          name: option.title,
          code: option.code,
          rate: option.meta,
          rationale: option.description,
          selected: option.id === selected.id,
        })),
      }),
    },
  ];

  try {
    const response = await chat(messages, undefined, undefined, undefined, {
      traceContext: {
        scene: 'diagnosis-path-reasoning',
        sourceModule: 'diagnosis_path',
        operationModule: 'diagnosis_path',
        operationAction: 'build_reasoning_path',
        title: '生成诊断路径说明',
      },
    });
    const parsed = extractJsonObject<DiagnosisPathLLMResponse>(response);
    return sanitizeLLMResponse(parsed, fallback);
  } catch (error) {
    console.warn('[diagnosisPath] LLM structured reasoning failed, fallback to heuristic payload:', error);
    return null;
  }
}

export async function buildDiagnosisPathPayload(
  context: DiagnosisPathContext,
  options: DiagnosisPathOption[],
  preferredOptionId?: string
): Promise<DiagnosisPathPayload | null> {
  const fallback = buildFallbackDiagnosisPathPayload(context, options, preferredOptionId);
  if (!fallback) {
    return null;
  }

  const llmPayload = await fetchDiagnosisPathFromLLM(context, options, preferredOptionId, fallback);
  return llmPayload || fallback;
}
