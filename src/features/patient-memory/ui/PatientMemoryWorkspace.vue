<template>
  <main class="patient-portrait">
    <header class="portrait-header">
      <button type="button" class="portrait-header__back" @click="$emit('close')">
        <Icon icon="lucide:arrow-left" size="16" />
        返回接诊
      </button>

      <div class="portrait-header__patient">
        <div class="portrait-avatar">
          <Icon icon="lucide:user" size="24" />
        </div>
        <div>
          <div class="portrait-header__name">
            <strong>{{ patientName }}</strong>
            <span>{{ patientMeta || '基本信息待同步' }}</span>
          </div>
          <div class="portrait-header__subline">
            <span>患者健康画像</span>
            <span v-if="patientId">患者ID：{{ maskedPatientId }}</span>
            <span v-if="brief">记忆版本 v{{ brief.memoryVersion }}</span>
          </div>
        </div>
      </div>

      <div class="portrait-header__data">
        <div class="source-chips" aria-label="数据来源">
          <span v-for="source in sourceChips" :key="source.key" class="source-chip">
            <i :style="{ background: source.color }"></i>
            {{ source.label }}
          </span>
        </div>
        <div class="freshness">
          <span>画像新鲜度</span>
          <strong>{{ freshnessText }}</strong>
        </div>
      </div>
    </header>

    <section v-if="brief?.qualityStatus === 'conflicted'" class="portrait-alert" role="status">
      <Icon icon="lucide:triangle-alert" size="17" />
      <div>
        <strong>存在 {{ brief.conflictCount }} 条待消解冲突</strong>
        <span>冲突记忆不会自动写入本次病历，请结合当前问诊和原始 HIS 记录核实。</span>
      </div>
    </section>

    <template v-if="brief">
      <div class="portrait-grid">
        <aside class="portrait-left">
          <section class="portrait-card portrait-card--ai">
            <div class="card-title">
              <span class="summary-dot">摘</span>
              一句话画像
            </div>
            <p>{{ aiSummary }}</p>
            <div class="confidence">
              <span>置信度：{{ confidenceLabel }}</span>
              <div class="confidence__bars" aria-hidden="true">
                <i v-for="index in 5" :key="index" :class="{ active: index <= confidenceScore }"></i>
              </div>
            </div>
            <button type="button" class="text-link">
              依据：{{ evidenceCount }} 条关键证据
              <Icon icon="lucide:chevron-right" size="13" />
            </button>
          </section>

          <section class="portrait-card">
            <div class="card-title">
              <Icon icon="lucide:circle-alert" size="16" />
              当前最值得关注的{{ priorityItems.length }}件事
            </div>
            <div v-if="priorityItems.length" class="priority-list">
              <article
                v-for="(item, index) in priorityItems"
                :key="item.id"
                :class="['priority-item', `priority-item--${item.level}`]"
              >
                <span>{{ index + 1 }}</span>
                <strong>{{ item.title }}</strong>
                <em>{{ item.badge }}</em>
              </article>
            </div>
            <div v-else class="soft-empty">暂无需要优先提示的风险。</div>
          </section>

          <section class="portrait-card">
            <div class="card-title">
              <Icon icon="lucide:shield-check" size="16" />
              安全与诊疗重点
            </div>
            <div v-if="riskItems.length" class="risk-list">
              <article v-for="item in riskItems" :key="item.id" class="risk-row">
                <span :class="['risk-row__icon', `risk-row__icon--${item.level}`]">
                  <Icon :icon="item.icon" size="14" />
                </span>
                <div>
                  <strong>{{ item.title }}</strong>
                  <small>{{ item.subtitle }}</small>
                </div>
                <em>{{ item.badge }}</em>
              </article>
            </div>
            <div v-else class="soft-empty">暂未同步过敏、慢病或生命体征风险。</div>
          </section>
        </aside>

        <section class="portrait-center">
          <div class="timeline-toolbar">
            <div>
              <h2>病程时间线</h2>
              <p>{{ timelineSubtitle }}</p>
            </div>
            <div class="timeline-switches">
              <button
                v-for="filter in timelineFilters"
                :key="filter.key"
                type="button"
                :class="{ active: timelineFilter === filter.key }"
                @click="timelineFilter = filter.key"
              >
                {{ filter.label }}
              </button>
            </div>
          </div>

          <div v-if="filteredTimelineEvents.length" class="timeline-list">
            <article v-for="event in visibleTimelineEvents" :key="event.id" class="timeline-event">
              <time>{{ event.dateLabel }}</time>
              <div class="timeline-event__node"></div>
              <div class="timeline-event__card">
                <div class="timeline-event__head">
                  <strong>{{ event.title }}</strong>
                  <span :class="['type-pill', `type-pill--${event.type}`]">{{ event.typeLabel }}</span>
                </div>
                <p>{{ event.description }}</p>
                <div class="timeline-event__meta">
                  <span>{{ event.source }}</span>
                  <button type="button">查看证据</button>
                </div>
              </div>
            </article>
          </div>
          <div v-else class="timeline-empty">
            <Icon icon="lucide:database-zap" size="26" />
            <strong>尚未形成可排序的病程事件</strong>
            <span>继续同步 HIS 就诊、报告和体征后，这里会按时间沉淀纵向画像。</span>
          </div>

          <button
            v-if="filteredTimelineEvents.length > visibleTimelineEvents.length"
            type="button"
            class="expand-button"
            @click="timelineExpanded = true"
          >
            展开更多记录（{{ filteredTimelineEvents.length - visibleTimelineEvents.length }}）
            <Icon icon="lucide:chevron-down" size="14" />
          </button>
        </section>

        <aside class="portrait-right">
          <section class="portrait-card">
            <div class="card-title card-title--between">
              <span>
                <Icon icon="lucide:heart-pulse" size="16" />
                趋势与变化
              </span>
              <small>近况</small>
            </div>
            <div v-if="trendCards.length" class="trend-list">
              <article v-for="trend in trendCards" :key="trend.key" class="trend-card">
                <div>
                  <strong>{{ trend.title }}</strong>
                  <span>{{ trend.value }}</span>
                </div>
                <em :class="`trend-card__level--${trend.level}`">{{ trend.label }}</em>
              </article>
            </div>
            <div v-else class="soft-empty">生命体征和检验趋势仍在同步中。</div>
          </section>

          <section class="portrait-card">
            <div class="card-title">
              <Icon icon="lucide:list" size="16" />
              画像构成
            </div>
            <div class="composition-list">
              <div v-for="item in compositionItems" :key="item.key" class="composition-row">
                <span>{{ item.label }}</span>
                <strong>{{ item.count }}</strong>
              </div>
            </div>
          </section>

          <section class="portrait-card portrait-card--note">
            <div class="card-title">
              <Icon icon="lucide:file-pen" size="16" />
              画像说明
            </div>
            <p>画像由 HIS、历史病历、检验检查与医生确认信息融合生成。当前摘要为规则整理结果，不替代本次问诊和原始病历判断。</p>
          </section>
        </aside>
      </div>

      <section class="action-panel">
        <div class="action-panel__title">
          <Icon icon="lucide:circle-check" size="17" />
          医生本次可行动作
        </div>
        <div class="action-grid">
          <article v-for="action in actionCards" :key="action.key" :class="['action-card', `action-card--${action.tone}`]">
            <Icon :icon="action.icon" size="22" />
            <div>
              <strong>{{ action.title }}</strong>
              <p>{{ action.description }}</p>
              <label>
                <input
                  type="checkbox"
                  :checked="completedActions.includes(action.key)"
                  @change="toggleAction(action.key)"
                />
                已完成
              </label>
            </div>
          </article>
          <article class="action-card action-card--custom">
            <strong>自定义关注</strong>
            <textarea v-model="doctorNote" placeholder="可在此记录重点关注内容，不会自动写回 HIS..." />
          </article>
        </div>
      </section>
    </template>

    <section v-else class="portrait-empty">
      <Icon icon="lucide:database-zap" size="28" />
      <strong>尚未形成健康画像</strong>
      <span>完成一次 HIS 历史同步后，这里会展示可追溯的纵向健康事实。</span>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import Icon from '@shared/ui/Icon.vue';
import type { AppPatient } from '@/types/appState';
import type { PatientMemoryBrief, PatientMemoryFactItem, PatientMemoryFactType } from '@entities/patient-memory';
import {
  getPatientContextAgeText,
  getPatientContextGenderText,
  getPatientContextId,
  getPatientContextName,
} from '@/utils/patientContext';

type TimelineFilter = 'all' | 'risk' | 'diagnosis' | 'medication' | 'vital';
type RiskLevel = 'high' | 'medium' | 'service' | 'attention';

interface TimelineEvent {
  id: string;
  title: string;
  description: string;
  dateValue: number;
  dateLabel: string;
  type: PatientMemoryFactType | 'risk';
  typeLabel: string;
  source: string;
  factCount: number;
}

const props = defineProps<{
  patient?: AppPatient | null;
  brief?: PatientMemoryBrief | null;
}>();

defineEmits<{ (event: 'close'): void }>();

const timelineFilter = ref<TimelineFilter>('all');
const timelineExpanded = ref(false);
const completedActions = ref<string[]>([]);
const doctorNote = ref('');

const patientName = computed(() => getPatientContextName(props.patient) || props.brief?.patientName || '未知患者');
const patientMeta = computed(() => [
  getPatientContextGenderText(props.patient) || props.brief?.patientGender,
  getPatientContextAgeText(props.patient) || props.brief?.patientAge,
].filter(Boolean).join(' · '));
const patientId = computed(() => getPatientContextId(props.patient) || props.brief?.patientId || '');
const maskedPatientId = computed(() => {
  const id = patientId.value;
  if (id.length <= 6) return id;
  return `${id.slice(0, 3)}****${id.slice(-3)}`;
});

const allFacts = computed(() => {
  const brief = props.brief;
  if (!brief) return [] as PatientMemoryFactItem[];
  return [
    ...brief.allergies,
    ...brief.chronicConditions,
    ...brief.recentDiagnoses,
    ...brief.recentMedications,
    ...brief.otherFacts,
  ];
});

const vitalFacts = computed(() => allFacts.value.filter((item) => item.factType === 'vital'));
const clinicalVitalFacts = computed(() => vitalFacts.value.filter((item) => !isAnthropometricVital(item)));
const bodyMeasurementFacts = computed(() => vitalFacts.value.filter(isAnthropometricVital));
const evidenceCount = computed(() => allFacts.value.length);
const freshnessText = computed(() => {
  if (!props.brief?.lastSyncTime) return '等待同步';
  return `${formatDateTime(props.brief.lastSyncTime)} 更新`;
});

const sourceChips = computed(() => {
  const sourceMap = new Map<string, number>();
  for (const fact of allFacts.value) {
    const key = String(fact.origin || fact.sourceType || 'his');
    sourceMap.set(key, (sourceMap.get(key) || 0) + 1);
  }
  const config: Record<string, { label: string; color: string }> = {
    his: { label: 'HIS', color: '#14b8a6' },
    patient_profile: { label: '基础档案', color: '#14b8a6' },
    visit_summary: { label: '历史病历', color: '#3b82f6' },
    outpatient_record: { label: '门诊病历', color: '#3b82f6' },
    lab_report: { label: '检验检查', color: '#8b5cf6' },
    exam_report: { label: '检验检查', color: '#8b5cf6' },
    doctor: { label: '医生确认', color: '#f59e0b' },
    admin: { label: '人工治理', color: '#64748b' },
  };
  const chips = Array.from(sourceMap.keys()).slice(0, 4).map((key) => ({
    key,
    ...(config[key] || { label: sourceLabel(key), color: '#64748b' }),
  }));
  return chips.length ? chips : [{ key: 'empty', label: '待同步', color: '#cbd5e1' }];
});

const confidenceScore = computed(() => {
  if (!props.brief) return 0;
  if (props.brief.qualityStatus === 'conflicted') return 3;
  if (evidenceCount.value >= 10) return 4;
  if (evidenceCount.value >= 4) return 3;
  return 2;
});
const confidenceLabel = computed(() => {
  if (props.brief?.qualityStatus === 'conflicted') return '需核对';
  if (confidenceScore.value >= 4) return '较高';
  if (confidenceScore.value >= 3) return '中等';
  return '初步';
});

const aiSummary = computed(() => {
  const brief = props.brief;
  if (!brief) return '尚未形成画像。';
  const meta = patientMeta.value ? `${patientMeta.value}患者` : '当前患者';
  const allergy = brief.allergies[0] ? `需避开${factTitle(brief.allergies[0])}` : '';
  const chronic = brief.chronicConditions.slice(0, 2).map(factTitle).join('、');
  const diagnosis = brief.recentDiagnoses[0] ? factTitle(brief.recentDiagnoses[0]) : '';
  const vital = clinicalVitalFacts.value[0]
    ? `${factTitle(clinicalVitalFacts.value[0])}${clinicalVitalFacts.value[0].valueText ? ` ${clinicalVitalFacts.value[0].valueText}` : ''}`
    : '';
  const fragments = [
    chronic ? `长期关注${chronic}` : '',
    diagnosis ? `近期诊断提示${diagnosis}` : '',
    vital ? `本次/近期体征见${vital}` : '',
    allergy,
  ].filter(Boolean);
  return fragments.length
    ? `${meta}，${fragments.join('，')}，建议本次诊疗优先核对风险、用药连续性和随访需求。`
    : `${meta}，目前画像信息仍较少，建议继续同步 HIS 历史、检验检查和本次生命体征。`;
});

const priorityItems = computed(() => {
  const items: Array<{ id: string; title: string; badge: string; level: RiskLevel }> = [];
  if (props.brief?.allergies[0]) {
    items.push({
      id: `allergy-${props.brief.allergies[0].factId}`,
      title: '用药前需核对过敏禁忌',
      badge: '安全',
      level: 'high',
    });
  }
  const attentionVital = clinicalVitalFacts.value.find(isAttentionVital) || clinicalVitalFacts.value[0];
  if (attentionVital) {
    items.push({
      id: `vital-${attentionVital.factId}`,
      title: `${factTitle(attentionVital)}${attentionVital.valueText ? ` ${attentionVital.valueText}` : ''}`,
      badge: isAttentionVital(attentionVital) ? '需复核' : '已记录',
      level: isAttentionVital(attentionVital) ? 'attention' : 'service',
    });
  }
  if (items.length < 3 && props.brief?.chronicConditions[0]) {
    items.push({
      id: `chronic-${props.brief.chronicConditions[0].factId}`,
      title: `长期问题：${factTitle(props.brief.chronicConditions[0])}`,
      badge: '随访',
      level: 'medium',
    });
  }
  if (items.length < 3 && props.brief?.recentMedications[0]) {
    items.push({
      id: `med-${props.brief.recentMedications[0].factId}`,
      title: `近期用药：${factTitle(props.brief.recentMedications[0])}`,
      badge: '用药核对',
      level: 'service',
    });
  }
  return items.slice(0, 3);
});

const riskItems = computed(() => {
  const rows: Array<{ id: string; title: string; subtitle: string; badge: string; icon: string; level: RiskLevel }> = [];
  for (const item of props.brief?.allergies || []) {
    rows.push({
      id: item.factId,
      title: factTitle(item),
      subtitle: item.evidenceText || 'HIS过敏史',
      badge: '过敏',
      icon: 'lucide:triangle-alert',
      level: 'high',
    });
  }
  for (const item of props.brief?.chronicConditions || []) {
    rows.push({
      id: item.factId,
      title: factTitle(item),
      subtitle: item.evidenceText || '历史诊断',
      badge: '长期',
      icon: 'lucide:heart-pulse',
      level: 'medium',
    });
  }
  for (const item of clinicalVitalFacts.value.filter(isAttentionVital).slice(0, 2)) {
    rows.push({
      id: item.factId,
      title: factTitle(item),
      subtitle: item.valueText || item.evidenceText || '生命体征',
      badge: '复测',
      icon: 'lucide:heart-pulse',
      level: 'attention',
    });
  }
  return rows.slice(0, 5);
});

const timelineFilters: Array<{ key: TimelineFilter; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'risk', label: '风险' },
  { key: 'diagnosis', label: '诊断' },
  { key: 'medication', label: '用药' },
  { key: 'vital', label: '体征' },
];

const timelineEvents = computed<TimelineEvent[]>(() => buildTimelineEvents(allFacts.value));

const filteredTimelineEvents = computed(() => {
  if (timelineFilter.value === 'all') return timelineEvents.value;
  if (timelineFilter.value === 'risk') {
    return timelineEvents.value.filter((item) => ['allergy', 'chronic_condition', 'vital'].includes(item.type));
  }
  return timelineEvents.value.filter((item) => item.type === timelineFilter.value);
});
const visibleTimelineEvents = computed(() => timelineExpanded.value
  ? filteredTimelineEvents.value
  : filteredTimelineEvents.value.slice(0, 7));
const timelineSubtitle = computed(() => `${filteredTimelineEvents.value.length} 个就诊主题 · 已合并同次体征与同类事实`);

const trendCards = computed(() => {
  const cards = clinicalVitalFacts.value.slice(0, 4).map((fact) => ({
    key: fact.factId,
    title: factTitle(fact),
    value: fact.valueText || '已记录',
    label: inferTrendLabel(fact),
    level: inferTrendLevel(fact),
  }));
  if (!cards.length && props.brief?.recentMedications.length) {
    cards.push({
      key: 'medication-adherence',
      title: '用药连续性',
      value: `${props.brief.recentMedications.length} 条近期用药`,
      label: '待核对',
      level: 'attention',
    });
  }
  return cards;
});

const compositionItems = computed(() => [
  { key: 'allergy', label: '过敏', count: props.brief?.allergies.length || 0 },
  { key: 'chronic', label: '慢病/长期问题', count: props.brief?.chronicConditions.length || 0 },
  { key: 'diagnosis', label: '近期诊断', count: props.brief?.recentDiagnoses.length || 0 },
  { key: 'medication', label: '近期用药', count: props.brief?.recentMedications.length || 0 },
  { key: 'vital', label: '临床体征', count: clinicalVitalFacts.value.length },
  { key: 'body', label: '基础测量', count: bodyMeasurementFacts.value.length },
]);

const actionCards = computed(() => [
  {
    key: 'question-risk',
    title: '追问',
    description: props.brief?.allergies[0]
      ? `确认${factTitle(props.brief.allergies[0])}过敏表现、时间和严重程度。`
      : '核对近期症状变化和医生最关心的问题。',
    icon: 'lucide:message-square-warning',
    tone: 'danger',
  },
  {
    key: 'medication-review',
    title: '核对',
    description: props.brief?.recentMedications[0]
      ? `核对近期是否仍在使用${factTitle(props.brief.recentMedications[0])}。`
      : '核对当前正在使用的长期药物和停药原因。',
    icon: 'lucide:pill',
    tone: 'warning',
  },
  {
    key: 'follow-up',
    title: '补随访',
    description: props.brief?.chronicConditions[0]
      ? `围绕${factTitle(props.brief.chronicConditions[0])}完善控制情况和随访计划。`
      : '根据本次诊断补充随访和复查建议。',
    icon: 'lucide:refresh-cw',
    tone: 'info',
  },
  {
    key: 'check-vitals',
    title: '建议检查',
    description: clinicalVitalFacts.value.length
      ? '结合体征变化判断是否需要复测血压、体温或完善相关检查。'
      : '生命体征暂少，必要时补录血压、体温、心率等。',
    icon: 'lucide:file-text',
    tone: 'neutral',
  },
]);

function toggleAction(key: string): void {
  completedActions.value = completedActions.value.includes(key)
    ? completedActions.value.filter((item) => item !== key)
    : [...completedActions.value, key];
}

function factTitle(item: PatientMemoryFactItem): string {
  return item.name || item.valueText || item.code || '待核实事实';
}

function isAnthropometricVital(item: PatientMemoryFactItem): boolean {
  const text = `${item.name || ''}${item.valueText || ''}`;
  return /身高|体重|腰围|BMI|体质指数/u.test(text);
}

function parseFirstNumber(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = value.match(/-?\d+(?:\.\d+)?/u);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseBloodPressure(value: string | null | undefined): { systolic: number; diastolic: number } | null {
  if (!value) return null;
  const match = value.match(/(\d{2,3})\s*\/\s*(\d{2,3})/u);
  if (!match) return null;
  const systolic = Number(match[1]);
  const diastolic = Number(match[2]);
  return Number.isFinite(systolic) && Number.isFinite(diastolic)
    ? { systolic, diastolic }
    : null;
}

function isAttentionVital(item: PatientMemoryFactItem): boolean {
  const title = factTitle(item);
  const value = item.valueText || '';
  if (/血压|收缩压|舒张压/u.test(title)) {
    const pressure = parseBloodPressure(value);
    return Boolean(pressure && (pressure.systolic >= 140 || pressure.diastolic >= 90));
  }
  const number = parseFirstNumber(value);
  if (number === null) return false;
  if (/体温/u.test(title)) return number >= 37.3 || number < 35.5;
  if (/心率|脉搏/u.test(title)) return number >= 100 || number <= 50;
  if (/呼吸/u.test(title)) return number >= 24 || number <= 10;
  return false;
}

function formatFactBrief(item: PatientMemoryFactItem): string {
  const title = factTitle(item);
  return item.valueText && item.valueText !== title ? `${title} ${item.valueText}` : title;
}

function timelineGroupType(fact: PatientMemoryFactItem): PatientMemoryFactType | 'risk' {
  if (fact.factType === 'allergy') return 'risk';
  return fact.factType;
}

function timelineGroupTitle(type: TimelineEvent['type'], facts: PatientMemoryFactItem[]): string {
  if (type === 'vital') return '本次生命体征';
  if (type === 'risk') return '用药安全风险';
  if (type === 'chronic_condition') return '长期健康问题';
  if (type === 'diagnosis') return facts.length > 1 ? `诊断记录（${facts.length}项）` : factTitle(facts[0]);
  if (type === 'medication') return facts.length > 1 ? `近期用药（${facts.length}项）` : factTitle(facts[0]);
  return factTypeLabel(type);
}

function timelineGroupDescription(type: TimelineEvent['type'], facts: PatientMemoryFactItem[]): string {
  if (type === 'vital') {
    const clinical = facts.filter((item) => !isAnthropometricVital(item)).map(formatFactBrief);
    const bodyCount = facts.filter(isAnthropometricVital).length;
    const merged = clinical.slice(0, 4);
    if (bodyCount > 0) {
      merged.push(`基础测量${bodyCount}项已归档`);
    }
    return merged.length ? merged.join('；') : '已记录生命体征';
  }
  if (type === 'risk') {
    return `需核对：${facts.map(factTitle).slice(0, 4).join('、')}`;
  }
  return facts.map(formatFactBrief).slice(0, 4).join('；');
}

function buildTimelineEvents(facts: PatientMemoryFactItem[]): TimelineEvent[] {
  const fallbackDate = parseFactDate(props.brief?.lastSourceTime || props.brief?.lastSyncTime) ?? Date.now();
  const groups = new Map<string, { type: TimelineEvent['type']; dateValue: number; source: string; facts: PatientMemoryFactItem[] }>();

  facts.forEach((fact) => {
    const type = timelineGroupType(fact);
    const dateValue = parseFactDate(fact.lastObservedAt) ?? fallbackDate;
    const dateLabel = formatTimelineDate(dateValue);
    const source = fact.evidenceText || sourceLabel(fact.sourceType);
    const groupSource = sourceLabel(fact.sourceType || fact.origin || 'his');
    const key = `${dateLabel}|${type}|${groupSource}`;
    const existing = groups.get(key);
    if (existing) {
      existing.facts.push(fact);
      return;
    }
    groups.set(key, {
      type,
      dateValue,
      source,
      facts: [fact],
    });
  });

  return Array.from(groups.entries())
    .map(([key, group]): TimelineEvent => ({
      id: key,
      title: timelineGroupTitle(group.type, group.facts),
      description: timelineGroupDescription(group.type, group.facts),
      dateValue: group.dateValue,
      dateLabel: formatTimelineDate(group.dateValue),
      type: group.type,
      typeLabel: factTypeLabel(group.type),
      source: group.source,
      factCount: group.facts.length,
    }))
    .sort((left, right) => right.dateValue - left.dateValue);
}

function sourceLabel(source: unknown): string {
  return {
    patient_profile: '患者基本信息',
    allergy_snapshot: '过敏史快照',
    visit_summary: '历史就诊摘要',
    outpatient_record: '门诊病历',
    lab_report: '检验报告',
    exam_report: '检查报告',
    doctor_confirmation: '医生确认',
    his: 'HIS记录',
  }[String(source)] || '可追溯来源';
}

function factTypeLabel(type: PatientMemoryFactType | 'risk'): string {
  return {
    allergy: '过敏',
    chronic_condition: '慢病',
    diagnosis: '诊断',
    medication: '用药',
    procedure: '处置',
    lab_result: '检验',
    exam_result: '检查',
    vital: '体征',
    history: '病史',
    reminder: '提醒',
    risk: '风险',
  }[type] || '事实';
}

function parseFactDate(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDateTime(value: string): string {
  return String(value).replace('T', ' ').slice(0, 16);
}

function formatTimelineDate(value: number): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '时间待同步';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function inferTrendLabel(fact: PatientMemoryFactItem): string {
  const text = `${fact.name || ''}${fact.valueText || ''}`;
  if (/血压|收缩压|舒张压|体温|心率|脉搏|呼吸/u.test(text)) return '需关注';
  return '已记录';
}

function inferTrendLevel(fact: PatientMemoryFactItem): 'attention' | 'normal' {
  const text = `${fact.name || ''}${fact.valueText || ''}`;
  return /血压|体温|心率|脉搏|呼吸/u.test(text) ? 'attention' : 'normal';
}
</script>

<style scoped>
.patient-portrait {
  width: 100%;
  height: calc(100vh - 40px);
  min-height: 0;
  padding: 16px;
  overflow-x: hidden;
  overflow-y: auto;
  box-sizing: border-box;
  color: #20313d;
  background:
    radial-gradient(circle at 14% 8%, rgba(20, 184, 166, 0.12), transparent 28%),
    linear-gradient(180deg, #f5fbfa 0%, #f7fafc 42%, #f8fafc 100%);
}

.portrait-header,
.portrait-header__back,
.portrait-header__patient,
.portrait-header__name,
.portrait-header__subline,
.portrait-header__data,
.source-chips,
.source-chip,
.portrait-alert,
.card-title,
.timeline-toolbar,
.timeline-switches,
.timeline-event__head,
.timeline-event__meta,
.action-panel__title {
  display: flex;
  align-items: center;
}

.portrait-header {
  min-height: 74px;
  justify-content: space-between;
  gap: 18px;
  padding: 12px 16px;
  border: 1px solid rgba(203, 213, 225, 0.74);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 16px 38px rgba(15, 65, 76, 0.08);
  backdrop-filter: blur(18px);
}

.portrait-header > * {
  min-width: 0;
}

.portrait-header__back {
  flex: none;
  gap: 6px;
  border: 0;
  color: #2f6270;
  background: transparent;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.portrait-header__back:hover { color: #0f8f7b; }

.portrait-header__patient {
  flex: 1;
  min-width: 0;
  gap: 12px;
}

.portrait-header__patient > div:last-child {
  min-width: 0;
}

.portrait-avatar {
  display: grid;
  flex: none;
  width: 46px;
  height: 46px;
  place-items: center;
  border: 1px solid #dbeafe;
  border-radius: 50%;
  color: #315b90;
  background: linear-gradient(145deg, #ffffff, #e9f4ff);
  box-shadow: inset 0 -6px 14px rgba(59, 130, 246, 0.08);
}

.portrait-header__name {
  gap: 10px;
  min-width: 0;
}

.portrait-header__name strong {
  overflow: hidden;
  color: #172a3a;
  font-size: 20px;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.portrait-header__name span {
  color: #5b7a96;
  font-size: 13px;
  white-space: nowrap;
}

.portrait-header__subline {
  flex-wrap: wrap;
  gap: 6px 14px;
  margin-top: 6px;
  color: #718096;
  font-size: 11px;
}

.portrait-header__data {
  justify-content: flex-end;
  gap: 16px;
  flex: 0 1 330px;
  min-width: 0;
}

.source-chips {
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}

.source-chip {
  gap: 5px;
  color: #506174;
  font-size: 11px;
  white-space: nowrap;
}

.source-chip i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.freshness {
  display: grid;
  gap: 3px;
  padding-left: 14px;
  border-left: 1px solid #e2e8f0;
  color: #718096;
  font-size: 11px;
  white-space: nowrap;
}

.freshness strong {
  color: #0f8f7b;
  font-size: 12px;
}

.portrait-alert {
  gap: 9px;
  margin-top: 12px;
  padding: 10px 12px;
  border: 1px solid #fecaca;
  border-radius: 14px;
  color: #b91c1c;
  background: rgba(254, 242, 242, 0.86);
}

.portrait-alert div { display: grid; gap: 2px; }
.portrait-alert span { font-size: 12px; }

.portrait-grid {
  display: grid;
  grid-template-columns: minmax(210px, 240px) minmax(0, 1fr) minmax(200px, 230px);
  gap: 12px;
  margin-top: 10px;
}

.portrait-left,
.portrait-right {
  display: grid;
  align-content: start;
  gap: 10px;
  min-width: 0;
}

.portrait-card,
.portrait-center,
.action-panel {
  min-width: 0;
  border: 1px solid rgba(226, 232, 240, 0.9);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 12px 28px rgba(23, 42, 49, 0.055);
}

.portrait-card {
  padding: 13px;
  overflow: hidden;
}

.portrait-card--ai {
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.94), rgba(239, 253, 250, 0.92));
}

.portrait-card--ai p {
  margin: 12px 0 13px;
  color: #31465c;
  font-size: 13px;
  line-height: 1.75;
}

.card-title {
  gap: 7px;
  color: #26465a;
  font-size: 13px;
  font-weight: 800;
}

.card-title--between {
  justify-content: space-between;
}

.card-title--between span {
  display: flex;
  align-items: center;
  gap: 7px;
}

.card-title small {
  color: #94a3b8;
  font-size: 11px;
  font-weight: 600;
}

.summary-dot {
  display: inline-grid;
  width: 22px;
  height: 22px;
  place-items: center;
  border-radius: 50%;
  color: #0f766e;
  background: #ccfbf1;
  font-size: 10px;
  font-weight: 900;
}

.confidence {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: #64748b;
  font-size: 11px;
}

.confidence__bars {
  display: flex;
  gap: 4px;
}

.confidence__bars i {
  width: 22px;
  height: 5px;
  border-radius: 999px;
  background: #e2e8f0;
}

.confidence__bars i.active {
  background: linear-gradient(90deg, #14b8a6, #45cdbd);
}

.text-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 10px;
  padding: 0;
  border: 0;
  color: #0f8f7b;
  background: transparent;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}

.priority-list,
.risk-list,
.trend-list,
.composition-list {
  display: grid;
  gap: 8px;
  margin-top: 12px;
}

.priority-item,
.risk-row,
.trend-card,
.composition-row {
  min-width: 0;
  display: flex;
  align-items: center;
}

.priority-item {
  gap: 8px;
  min-height: 32px;
}

.priority-item span {
  display: grid;
  flex: none;
  width: 18px;
  height: 18px;
  place-items: center;
  border-radius: 50%;
  color: #fff;
  font-size: 10px;
  font-style: normal;
  font-weight: 800;
}

.priority-item--high span { background: #f87171; }
.priority-item--medium span { background: #f59e0b; }
.priority-item--attention span { background: #14b8a6; }
.priority-item--service span { background: #60a5fa; }

.priority-item strong {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: #34475b;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.priority-item em,
.risk-row em {
  flex: none;
  max-width: 58px;
  overflow: hidden;
  padding: 2px 6px;
  border-radius: 999px;
  color: #b45309;
  background: #fff7ed;
  font-size: 10px;
  font-style: normal;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.priority-item--high em,
.risk-row__icon--high + div + em {
  color: #dc2626;
  background: #fee2e2;
}

.risk-row {
  gap: 8px;
  padding: 7px;
  border: 1px solid #eef2f7;
  border-radius: 10px;
}

.risk-row__icon {
  display: grid;
  flex: none;
  width: 24px;
  height: 24px;
  place-items: center;
  border-radius: 8px;
}

.risk-row__icon--high { color: #dc2626; background: #fee2e2; }
.risk-row__icon--medium { color: #d97706; background: #ffedd5; }
.risk-row__icon--attention { color: #0f766e; background: #ccfbf1; }
.risk-row__icon--service { color: #2563eb; background: #dbeafe; }

.risk-row div {
  display: grid;
  flex: 1;
  min-width: 0;
  gap: 2px;
}

.risk-row strong,
.trend-card strong,
.composition-row span {
  overflow: hidden;
  color: #34475b;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.risk-row small,
.trend-card span,
.soft-empty,
.portrait-card--note p {
  color: #64748b;
  font-size: 11px;
  line-height: 1.55;
}

.portrait-center {
  min-width: 0;
  overflow: hidden;
  padding: 15px 16px;
}

.timeline-toolbar {
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.timeline-toolbar h2 {
  margin: 0;
  color: #244159;
  font-size: 16px;
}

.timeline-toolbar p {
  margin: 5px 0 0;
  color: #718096;
  font-size: 11px;
}

.timeline-switches {
  min-width: 0;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 5px;
}

.timeline-switches button {
  padding: 5px 9px;
  border: 1px solid transparent;
  border-radius: 8px;
  color: #64748b;
  background: #f1f5f9;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}

.timeline-switches button.active {
  border-color: #5eead4;
  color: #0f766e;
  background: #f0fdfa;
}

.timeline-list {
  position: relative;
  display: grid;
  gap: 9px;
  padding-left: 92px;
}

.timeline-list::before {
  position: absolute;
  top: 7px;
  bottom: 8px;
  left: 75px;
  width: 1px;
  background: linear-gradient(180deg, #14b8a6, #d7e6ed);
  content: '';
}

.timeline-event {
  position: relative;
  display: grid;
  min-width: 0;
}

.timeline-event time {
  position: absolute;
  top: 13px;
  left: -92px;
  width: 68px;
  color: #64748b;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.timeline-event__node {
  position: absolute;
  top: 16px;
  left: -20px;
  width: 8px;
  height: 8px;
  border: 2px solid #fff;
  border-radius: 50%;
  background: #14b8a6;
  box-shadow: 0 0 0 1px #8ddbd2;
}

.timeline-event__card {
  min-width: 0;
  overflow: hidden;
  padding: 10px 11px;
  border: 1px solid #e6eef5;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 5px 14px rgba(15, 23, 42, 0.03);
}

.timeline-event__head {
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}

.timeline-event__head strong {
  overflow: hidden;
  color: #263b51;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.timeline-event__card p {
  display: -webkit-box;
  margin: 6px 0 8px;
  overflow: hidden;
  color: #53677c;
  font-size: 12px;
  line-height: 1.5;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.timeline-event__meta {
  justify-content: space-between;
  gap: 10px;
  color: #8a99aa;
  font-size: 10px;
}

.timeline-event__meta span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.timeline-event__meta button {
  flex: none;
  padding: 2px 7px;
  border: 1px solid #dbeafe;
  border-radius: 7px;
  color: #3b6d8c;
  background: #f8fbff;
  font-size: 10px;
  cursor: pointer;
}

.type-pill {
  flex: none;
  padding: 2px 7px;
  border-radius: 999px;
  color: #0f766e;
  background: #ccfbf1;
  font-size: 10px;
  font-weight: 800;
}

.type-pill--allergy { color: #dc2626; background: #fee2e2; }
.type-pill--chronic_condition,
.type-pill--diagnosis { color: #d97706; background: #ffedd5; }
.type-pill--medication { color: #2563eb; background: #dbeafe; }
.type-pill--vital { color: #7c3aed; background: #ede9fe; }

.expand-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 100%;
  margin-top: 10px;
  padding: 8px;
  border: 0;
  color: #0f8f7b;
  background: transparent;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.trend-card {
  justify-content: space-between;
  gap: 8px;
  padding: 9px;
  border: 1px solid #eef2f7;
  border-radius: 11px;
  background: linear-gradient(180deg, #ffffff, #fbfdff);
}

.trend-card div {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.trend-card em {
  flex: none;
  padding: 3px 7px;
  border-radius: 999px;
  font-size: 10px;
  font-style: normal;
  font-weight: 800;
}

.trend-card__level--attention {
  color: #b45309;
  background: #fef3c7;
}

.trend-card__level--normal {
  color: #0f766e;
  background: #ccfbf1;
}

.composition-row {
  justify-content: space-between;
  padding: 7px 0;
  border-bottom: 1px solid #f1f5f9;
}

.composition-row:last-child { border-bottom: 0; }
.composition-row strong { color: #0f8f7b; font-size: 13px; }

.portrait-card--note p {
  margin: 10px 0 0;
}

.action-panel {
  margin-top: 10px;
  padding: 13px;
}

.action-panel__title {
  gap: 7px;
  margin-bottom: 10px;
  color: #26465a;
  font-size: 13px;
  font-weight: 800;
}

.action-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 9px;
}

.action-card {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 8px;
  min-width: 0;
  overflow: hidden;
  padding: 10px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
}

.action-card--danger { border-color: #fecaca; background: #fffafa; color: #dc2626; }
.action-card--warning { border-color: #fed7aa; background: #fffaf3; color: #d97706; }
.action-card--info { border-color: #bfdbfe; background: #f8fbff; color: #2563eb; }
.action-card--neutral { border-color: #ddd6fe; background: #fbfaff; color: #7c3aed; }

.action-card div {
  display: grid;
  min-width: 0;
  gap: 5px;
}

.action-card strong {
  color: #34475b;
  font-size: 12px;
}

.action-card p {
  display: -webkit-box;
  min-height: 34px;
  margin: 0;
  overflow: hidden;
  color: #64748b;
  font-size: 11px;
  line-height: 1.5;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.action-card label {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #718096;
  font-size: 11px;
}

.action-card--custom {
  grid-template-columns: 1fr;
}

.action-card textarea {
  width: 100%;
  min-height: 64px;
  padding: 8px;
  resize: none;
  border: 1px solid #eef2f7;
  border-radius: 9px;
  box-sizing: border-box;
  color: #334155;
  background: #f8fafc;
  font-size: 11px;
  outline: none;
}

.action-card textarea:focus {
  border-color: #5eead4;
  box-shadow: 0 0 0 3px rgba(20, 184, 166, 0.12);
}

.timeline-empty,
.portrait-empty {
  display: grid;
  justify-items: center;
  gap: 7px;
  padding: 70px 20px;
  color: #64748b;
  text-align: center;
}

.timeline-empty strong,
.portrait-empty strong {
  color: #334155;
}

.timeline-empty span,
.portrait-empty span {
  max-width: 360px;
  font-size: 12px;
  line-height: 1.6;
}

.soft-empty {
  margin-top: 12px;
  padding: 12px;
  border-radius: 10px;
  background: #f8fafc;
  text-align: center;
}

@media (max-width: 900px) {
  .portrait-header {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .portrait-header__data {
    width: 100%;
    min-width: 0;
    justify-content: space-between;
  }

  .portrait-grid {
    grid-template-columns: 1fr;
  }

  .portrait-left,
  .portrait-right {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .action-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .patient-portrait {
    padding: 12px;
  }

  .portrait-header__patient,
  .portrait-header__data,
  .timeline-toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .portrait-left,
  .portrait-right,
  .action-grid {
    grid-template-columns: 1fr;
  }

  .timeline-list {
    padding-left: 76px;
  }

  .timeline-list::before {
    left: 61px;
  }

  .timeline-event time {
    left: -76px;
    width: 54px;
  }
}
</style>
