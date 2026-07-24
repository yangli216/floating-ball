import type {
  ChronicDiseaseType,
  PublishedClinicalPath,
  PublishedFollowUpTemplate,
} from '../types';

export const CHRONIC_RULE_VERSION = 'CHRONIC-RULE-2026.1';

export const PUBLISHED_FOLLOW_UP_TEMPLATES: Record<ChronicDiseaseType, PublishedFollowUpTemplate> = {
  hypertension: {
    diseaseType: 'hypertension',
    templateVersion: 'HTN-FOLLOWUP-2026.1',
    ruleVersion: CHRONIC_RULE_VERSION,
    evidenceVersion: '国家基本公共卫生服务规范-第三版',
    pathVersion: 'HTN-PATH-2024.1',
    publishedAt: '2026-07-23',
    reviewStatus: 'published',
    symptomOptions: [
      { code: 'none', label: '无症状' },
      { code: 'headache_dizziness', label: '头痛头晕' },
      { code: 'palpitation', label: '心悸' },
      { code: 'chest_tightness', label: '胸闷' },
      { code: 'nausea_vomiting', label: '恶心呕吐' },
      { code: 'blurred_vision', label: '视物模糊' },
      { code: 'other', label: '其他' },
    ],
  },
  type2_diabetes: {
    diseaseType: 'type2_diabetes',
    templateVersion: 'T2DM-FOLLOWUP-2026.1',
    ruleVersion: CHRONIC_RULE_VERSION,
    evidenceVersion: '国家基层糖尿病防治管理指南-2022',
    pathVersion: 'T2DM-PATH-2022.1',
    publishedAt: '2026-07-23',
    reviewStatus: 'published',
    symptomOptions: [
      { code: 'none', label: '无症状' },
      { code: 'polydipsia_polyuria', label: '多饮多尿' },
      { code: 'weight_loss', label: '体重下降' },
      { code: 'blurred_vision', label: '视物模糊' },
      { code: 'limb_numbness', label: '手脚麻木' },
      { code: 'hypoglycemia', label: '低血糖症状' },
      { code: 'other', label: '其他' },
    ],
  },
};

export const PUBLISHED_CLINICAL_PATHS: Record<ChronicDiseaseType, PublishedClinicalPath> = {
  hypertension: {
    diseaseType: 'hypertension',
    title: '高血压管理路径',
    pathVersion: 'HTN-PATH-2024.1',
    evidenceVersion: '中国高血压防治指南-2024',
    publishedAt: '2026-07-23',
    reviewStatus: 'published',
    contentHash: 'sha256:htn-path-2024-1-reviewed',
    nodes: [
      {
        id: 'confirm',
        title: '确认诊断与危险分层',
        shortLabel: '诊断与分层',
        description: '核对诊断依据、近期血压、靶器官损害与合并危险因素，形成医生确认的风险分层。',
        evidenceHints: ['明确高血压诊断或连续异常血压', '近期诊室或家庭血压', '心脑肾危险因素'],
        verificationPrompt: '核实是否存在急症信号、继发性高血压线索或需要转诊的靶器官损害。',
        safetyNote: '疑似高血压急症时不进入常规随访路径，应立即按急诊流程处置。',
      },
      {
        id: 'target',
        title: '确认个体化血压目标',
        shortLabel: '治疗目标',
        description: '结合年龄、合并症、耐受性与家庭监测，由医生确认个体化目标。',
        evidenceHints: ['患者年龄与衰弱情况', '糖尿病、肾病或心血管病', '既往低血压或不耐受'],
        verificationPrompt: '公卫管理阈值不能直接替代个体治疗目标，需要医生确认。',
      },
      {
        id: 'therapy',
        title: '评估当前治疗与依从性',
        shortLabel: '方案评估',
        description: '复核当前药物、用法、依从性、不良反应与生活方式干预。',
        evidenceHints: ['当前用药清单', '服药依从性', '不良反应与家庭血压'],
        verificationPrompt: '任何药物调整必须经过标准药品匹配、禁忌核对和医生确认。',
      },
      {
        id: 'follow-up',
        title: '形成随访、复诊与转诊计划',
        shortLabel: '随访计划',
        description: '根据控制情况确定随访分类、下一次随访、复诊或转诊安排。',
        evidenceHints: ['本次随访分类', '下一次随访日期', '异常就医与转诊条件'],
        verificationPrompt: '保存随访前核对分类、转诊原因和下一次随访日期。',
      },
    ],
    edges: [
      { source: 'confirm', target: 'target' },
      { source: 'target', target: 'therapy' },
      { source: 'therapy', target: 'follow-up' },
    ],
  },
  type2_diabetes: {
    diseaseType: 'type2_diabetes',
    title: '2 型糖尿病管理路径',
    pathVersion: 'T2DM-PATH-2022.1',
    evidenceVersion: '国家基层糖尿病防治管理指南-2022',
    publishedAt: '2026-07-23',
    reviewStatus: 'published',
    contentHash: 'sha256:t2dm-path-2022-1-reviewed',
    nodes: [
      {
        id: 'glucose',
        title: '评估血糖控制',
        shortLabel: '血糖评估',
        description: '结合空腹、餐后血糖与糖化血红蛋白，判断近期控制情况并核实低血糖。',
        evidenceHints: ['近期空腹/餐后血糖', '糖化血红蛋白', '低血糖症状或记录'],
        verificationPrompt: '系统只汇总已有事实，个体化控制目标由医生确认。',
      },
      {
        id: 'complication',
        title: '核实并发症与共病筛查',
        shortLabel: '并发症筛查',
        description: '核实肾脏、眼底、足部、血脂与心血管风险相关检查是否完成。',
        evidenceHints: ['肾功能及尿白蛋白', '眼底检查', '足部风险和血脂'],
        verificationPrompt: '缺少记录不等于未完成，应先核实院外或异地检查。',
      },
      {
        id: 'medicine',
        title: '复核降糖治疗',
        shortLabel: '用药复核',
        description: '在肾功能、低血糖风险、合并症和依从性基础上复核当前方案。',
        evidenceHints: ['当前用药', '肾功能', '低血糖与不良反应'],
        verificationPrompt: 'AI 只提出复核点，不自动新增或调整降糖药。',
      },
      {
        id: 'follow-up',
        title: '形成随访与转诊计划',
        shortLabel: '随访计划',
        description: '完成随访分类、健康教育、下一次随访和必要转诊。',
        evidenceHints: ['本次随访分类', '下次随访日期', '转诊条件'],
        verificationPrompt: '出现急性代谢紊乱或严重并发症信号时优先转诊。',
        safetyNote: '疑似酮症酸中毒、高渗状态或严重低血糖时立即按急诊流程处置。',
      },
    ],
    edges: [
      { source: 'glucose', target: 'complication' },
      { source: 'complication', target: 'medicine' },
      { source: 'medicine', target: 'follow-up' },
    ],
  },
};

export function getPublishedFollowUpTemplate(diseaseType: ChronicDiseaseType): PublishedFollowUpTemplate {
  return PUBLISHED_FOLLOW_UP_TEMPLATES[diseaseType];
}

export function getPublishedClinicalPath(diseaseType: ChronicDiseaseType): PublishedClinicalPath {
  return PUBLISHED_CLINICAL_PATHS[diseaseType];
}
