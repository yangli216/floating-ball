import type { ChronicDiseaseType } from '../types';

export interface ClinicalPathTableColumn {
  field: string;
  title: string;
  align?: 'left' | 'center';
}

export interface ClinicalPathTextDrawer {
  kind: 'text';
  widthPercent: number;
  items: string[];
  source?: string;
}

export interface ClinicalPathTableDrawer {
  kind: 'table';
  widthPercent: number;
  columns: ClinicalPathTableColumn[];
  rows: Array<Record<string, string>>;
  rowSpanField?: string;
  source?: string;
}

export type ClinicalPathDrawerConfig = ClinicalPathTextDrawer | ClinicalPathTableDrawer;

export interface ClinicalPathHotspot {
  id: string;
  label: string;
  activeImageUrl: string;
  x: number;
  y: number;
  width: number;
  height: number;
  clipPath?: string;
  drawer: ClinicalPathDrawerConfig;
}

export interface ClinicalPathDiagramConfig {
  diseaseType: ChronicDiseaseType;
  title: string;
  backgroundUrl: string;
  naturalWidth: number;
  naturalHeight: number;
  hotspots: ClinicalPathHotspot[];
}

const ASSET_ROOT = '/assets/chronic-disease/clinical-paths';
const HYPERTENSION_SOURCE = '《国家基层高血压防治管理手册（2020版）》';

const COMORBIDITY_COLUMNS: ClinicalPathTableColumn[] = [
  { field: 'feature', title: '患者特征', align: 'center' },
  { field: 'step1', title: '第 1 步', align: 'center' },
  { field: 'step2', title: '第 2 步', align: 'center' },
  { field: 'step3', title: '第 3 步', align: 'center' },
];

const COMORBIDITY_ROWS = [
  { feature: '高血压合并心肌梗死', step1: 'A+B²', step2: 'A+B+C³或A+B+D⁴', step3: '转诊或A+B+C³+D' },
  { feature: '高血压合并心绞痛', step1: 'B或A或C', step2: 'B+C或B+A或A+C', step3: 'B+C+A或B+C+D' },
  { feature: '高血压合并心力衰竭', step1: 'A+B²', step2: 'A+B+D⁴', step3: '转诊或A+B+C+D⁴+C³' },
  { feature: '高血压合并心脑卒中', step1: 'C或A或D', step2: 'C+A或C+D或A+D', step3: 'C+A+D' },
  { feature: '高血压合并糖尿病或慢性肾脏疾病⁵', step1: 'A', step2: 'A+C或A+D', step3: 'A+C+D' },
];

const COMORBIDITY_DRAWER: ClinicalPathTableDrawer = {
  kind: 'table',
  widthPercent: 60,
  columns: COMORBIDITY_COLUMNS,
  rows: COMORBIDITY_ROWS,
  source: HYPERTENSION_SOURCE,
};

export const CLINICAL_PATH_DIAGRAMS: Record<ChronicDiseaseType, ClinicalPathDiagramConfig> = {
  hypertension: {
    diseaseType: 'hypertension',
    title: '高血压管理路径',
    backgroundUrl: `${ASSET_ROOT}/hypertension/bg.png`,
    naturalWidth: 1019,
    naturalHeight: 737,
    hotspots: [
      {
        id: 'no-comorbidities',
        label: '无合并症药物治疗流程',
        activeImageUrl: `${ASSET_ROOT}/hypertension/noComorbidities.png`,
        x: 37.75,
        y: 239.188,
        width: 217.672,
        height: 435.188,
        drawer: {
          kind: 'text',
          widthPercent: 40,
          items: [
            'B：B 类药物适用于心率偏快者。每次调整治疗后均需观察 2~4 周，看达标情况。除非出现不良反应等不耐受或需紧急处理的情况。',
            'A：ACEI / ARB，即血管紧张素转换酶抑制剂 / 血管紧张素Ⅱ受体拮抗剂。',
            'B：β 受体阻滞剂。',
            'C：二氢吡啶类钙通道阻滞剂。',
            'D：利尿剂，常用噻嗪类利尿剂。',
          ],
          source: HYPERTENSION_SOURCE,
        },
      },
      {
        id: 'comorbidities-table',
        label: '有合并症高血压的治疗方案推荐表',
        activeImageUrl: `${ASSET_ROOT}/hypertension/yesComorbidities2.png`,
        x: 331.953,
        y: 375.2,
        width: 353,
        height: 131.188,
        drawer: COMORBIDITY_DRAWER,
      },
      {
        id: 'comorbidities-target',
        label: '有合并症高血压的治疗方案推荐表',
        activeImageUrl: `${ASSET_ROOT}/hypertension/yesComorbidities1.png`,
        x: 534.75,
        y: 545.188,
        width: 150.094,
        height: 72,
        clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0 50%)',
        drawer: COMORBIDITY_DRAWER,
      },
      {
        id: 'lifestyle',
        label: '生活方式干预目标及降压效果',
        activeImageUrl: `${ASSET_ROOT}/hypertension/wayOfLife.png`,
        x: 332.016,
        y: 163,
        width: 353,
        height: 195.594,
        drawer: {
          kind: 'table',
          widthPercent: 60,
          columns: [
            { field: 'content', title: '内容', align: 'center' },
            { field: 'target', title: '目标', align: 'center' },
            { field: 'result', title: '可获得的收缩压下降效果', align: 'center' },
          ],
          rows: [
            { content: '减少钠盐摄入', target: '每人每日食盐摄入量不超过 6 克（1 啤酒瓶盖）\n注意隐性盐的摄入（咸菜、鸡精、酱油等）', result: '2~8mmHg' },
            { content: '减轻体重', target: 'BMI<24，腰围<90cm（男），腰围<85cm（女）', result: '5~20mmHg/减重10kg' },
            { content: '规律运动', target: '中等强度运动，每次 30 分钟，每周 5~7 次', result: '4~9mmHg' },
            { content: '戒烟', target: '建议戒烟，避免被动吸烟', result: '——' },
            { content: '戒酒', target: '推荐不饮酒，目前在饮酒的高血压患者，建议戒酒', result: '——' },
            { content: '心理平衡', target: '减轻精神压力，保持心情愉悦', result: '——' },
          ],
          source: HYPERTENSION_SOURCE,
        },
      },
      {
        id: 'lipid-target',
        label: '高血压合并相关疾病或情况的降脂目标',
        activeImageUrl: `${ASSET_ROOT}/hypertension/hypertensiveCombination.png`,
        x: 331.953,
        y: 564.391,
        width: 149.094,
        height: 74.391,
        clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0 50%)',
        drawer: {
          kind: 'table',
          widthPercent: 60,
          columns: [
            { field: 'condition', title: '高血压合并疾病/情况', align: 'center' },
            { field: 'ldl', title: 'LDL-C 目标值', align: 'center' },
          ],
          rows: [
            { condition: '冠心病', ldl: '<1.8mmol/L\n（70mg/dl）' },
            { condition: '缺血性脑卒中', ldl: '<1.8mmol/L\n（70mg/dl）' },
            { condition: '外周动脉粥样硬化病', ldl: '<1.8mmol/L\n（70mg/dl）' },
            { condition: '慢性肾脏疾病', ldl: '<1.8mmol/L\n（70mg/dl）' },
            { condition: '≥40 岁糖尿病', ldl: '<1.8mmol/L\n（70mg/dl）' },
            { condition: 'TC≥7.2mmol/L（278mg/dl）或 LDL-C≥4.9mmol/L（190mg/dl）', ldl: '<1.8mmol/L\n（70mg/dl）' },
            { condition: '吸烟 + HDL<1mmol/L（40mg/dl）', ldl: '<2.6mmol/L\n（100mg/dl）' },
            { condition: '吸烟 + ≥45 岁男性或 ≥55 岁女性', ldl: '<2.6mmol/L\n（100mg/dl）' },
            { condition: 'HDL-C<1mmol/L（40mg/dl）+ ≥45 岁男性或 ≥55 岁女性', ldl: '<2.6mmol/L\n（100mg/dl）' },
            { condition: 'LDL-C≥3.4mmol/L（130mg/dl）（不符合上述情况）', ldl: '<3.4mmol/L\n（130mg/dl）' },
          ],
          rowSpanField: 'ldl',
          source: HYPERTENSION_SOURCE,
        },
      },
    ],
  },
  type2_diabetes: {
    diseaseType: 'type2_diabetes',
    title: '2 型糖尿病管理路径',
    backgroundUrl: `${ASSET_ROOT}/type2-diabetes/bg.png`,
    naturalWidth: 1188,
    naturalHeight: 888,
    hotspots: [],
  },
};

export function getClinicalPathDiagram(diseaseType: ChronicDiseaseType): ClinicalPathDiagramConfig {
  return CLINICAL_PATH_DIAGRAMS[diseaseType];
}

export function getClinicalPathHotspotStyle(
  diagram: ClinicalPathDiagramConfig,
  hotspot: ClinicalPathHotspot,
): Record<string, string> {
  const percent = (value: number, total: number) => `${((value / total) * 100).toFixed(4)}%`;
  return {
    left: percent(hotspot.x, diagram.naturalWidth),
    top: percent(hotspot.y, diagram.naturalHeight),
    width: percent(hotspot.width, diagram.naturalWidth),
    height: percent(hotspot.height, diagram.naturalHeight),
    ...(hotspot.clipPath ? { clipPath: hotspot.clipPath } : {}),
  };
}
