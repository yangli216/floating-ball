<template>
  <div
    class="rc-root"
    :class="stateClass"
    data-tauri-drag-region
  >
    <!-- Close -->
    <div class="rc-close" @click="trackClick('reception_close'); $emit('close')">
      <Icon icon="lucide:x" size="14" />
    </div>

    <!-- Header row -->
    <div class="rc-header">
      <!-- Avatar -->
      <div class="rc-avatar">
        <img
          class="rc-avatar-img"
          :src="avatarSrc"
          @error="onAvatarError"
          alt=""
          draggable="false"
        />
      </div>

      <!-- Info -->
      <div class="rc-info">
        <div class="rc-name-row">
          <span class="rc-name">{{ patientName }}</span>
          <span class="rc-meta">{{ gender === 'F' ? '女' : '男' }}</span>
          <span class="rc-meta">{{ age }}岁</span>
        </div>
        <div class="rc-badge-row">
          <span v-if="analyzing" class="rc-badge rc-badge--blue">
            <span class="rc-dot"></span>
            正在评估...
          </span>
          <span
            v-else-if="risks.length > 0"
            class="rc-badge rc-badge--orange rc-badge--clickable"
            @click="toggle"
            role="button"
            :title="expanded ? '收起风险详情' : '展开风险详情'"
          >
            <Icon icon="lucide:alert-circle" size="14" />
            {{ risks.length }}项健康风险
            <Icon
              class="rc-badge-caret"
              :icon="expanded ? 'lucide:chevron-up' : 'lucide:chevron-down'"
              size="14"
            />
          </span>
          <span v-else class="rc-badge rc-badge--green">
            <Icon icon="lucide:thumbs-up" size="14" />
            健康状态良好
          </span>
        </div>
      </div>
    </div>

    <!-- Risk items -->
    <div v-if="expanded && risks.length > 0" class="rc-risks">
      <div v-for="(r, i) in risks" :key="i" class="rc-risk-row">
        <span
          class="rc-tag"
          :style="{
            color: tagColor(r.category),
            borderColor: tagColor(r.category),
            background: tagBg(r.category),
          }"
        >{{ tagLabel(r.category) }}</span>
        <span class="rc-risk-text">{{ r.content }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import Icon from '@shared/ui/Icon.vue';
import { trackClick } from '@services/operationTracker';
import { resolvePatientAvatar, PATIENT_AVATAR_FALLBACK } from '@/utils/patientAvatar';
import type { RiskItem } from '../types';

const props = defineProps<{
  patientName: string;
  gender: 'M' | 'F';
  age: number;
  risks: RiskItem[];
  analyzing?: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'toggle-expand', expanded: boolean): void;
}>();

const expanded = ref(false);

const stateClass = computed(() => {
  if (props.analyzing) return 'rc-state-analyzing';
  if (props.risks.length > 0) return 'rc-state-risk';
  return 'rc-state-healthy';
});

// 头像加载策略：依据性别 + 年龄映射到 public/avatar/ 下的切图，
// 加载失败时回退默认头像。
const avatarSrc = ref<string>(
  resolvePatientAvatar({ gender: props.gender, age: props.age })
);
watch(
  () => [props.gender, props.age] as const,
  ([g, a]) => {
    avatarSrc.value = resolvePatientAvatar({ gender: g, age: a });
  }
);
function onAvatarError() {
  if (avatarSrc.value !== PATIENT_AVATAR_FALLBACK) {
    avatarSrc.value = PATIENT_AVATAR_FALLBACK;
  }
}

watch(() => props.risks, (r) => {
  const open = r.length > 0;
  expanded.value = open;
  emit('toggle-expand', open);
}, { immediate: true });

function toggle() {
  expanded.value = !expanded.value;
  trackClick('reception_toggle_risk_detail', { expanded: expanded.value, riskCount: props.risks.length });
  emit('toggle-expand', expanded.value);
}

const CATEGORY_COLORS: Record<string, string> = {
  allergy: '#dc2626',
  chronic: '#ea580c',
  medication: '#d97706',
  population: '#2563eb',
  vital: '#7c3aed',
  other: '#64748b',
};
const CATEGORY_BG: Record<string, string> = {
  allergy: '#fee2e2',
  chronic: '#fff4e5',
  medication: '#fef3c7',
  population: '#dbeafe',
  vital: '#ede9fe',
  other: '#f1f5f9',
};
const CATEGORY_LABELS: Record<string, string> = {
  allergy: '过敏',
  chronic: '慢病',
  medication: '用药',
  population: '人群',
  vital: '体征',
  other: '其他',
};

function tagColor(cat: string) { return CATEGORY_COLORS[cat] || '#64748b'; }
function tagBg(cat: string) { return CATEGORY_BG[cat] || '#f1f5f9'; }
function tagLabel(cat: string) { return CATEGORY_LABELS[cat] || '其他'; }
</script>

<style scoped>
.rc-root {
  position: absolute;
  inset: 1px;
  border-radius: 15px;
  display: flex;
  flex-direction: column;
  padding: 12px 14px;
  box-sizing: border-box;
  overflow: hidden;
  border: 1px solid transparent;
  background: #ffffff;
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.06);
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  transition: background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
}

.rc-state-healthy {
  background: linear-gradient(180deg, #f0fdf4 0%, #ffffff 70%);
  border-color: #86efac;
  box-shadow: 0 4px 14px rgba(22, 163, 74, 0.08);
}

.rc-state-risk {
  background: linear-gradient(180deg, #fff7ed 0%, #ffffff 70%);
  border-color: #fdba74;
  box-shadow: 0 4px 14px rgba(234, 88, 12, 0.1);
}

.rc-state-analyzing {
  background: linear-gradient(180deg, #eff6ff 0%, #ffffff 70%);
  border-color: #93c5fd;
  box-shadow: 0 4px 14px rgba(59, 130, 246, 0.08);
}

/* ---- close ---- */
.rc-close {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: rgba(0,0,0,0.06);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #94a3b8;
  z-index: 2;
  -webkit-app-region: no-drag;
}
.rc-close:hover { background: rgba(0,0,0,0.12); color: #475569; }

/* ---- header ---- */
.rc-header {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
  /* 预留右侧空间避免与关闭按钮重叠 */
  padding-right: 24px;
}

.rc-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: #e8f1fb;
  box-shadow:
    0 0 0 2px #ffffff,
    0 1px 4px rgba(15, 23, 42, 0.08);
}

.rc-avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  user-select: none;
  -webkit-user-drag: none;
}

.rc-info { flex: 1; min-width: 0; }

.rc-name-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 4px;
}
.rc-name { font-size: 15px; font-weight: 700; color: #1e293b; }
.rc-meta { font-size: 13px; color: #94a3b8; }

/* ---- badge ---- */
.rc-badge-row { display: flex; }

.rc-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 10px;
  border-radius: 12px;
  font-size: 12.5px;
  font-weight: 600;
  line-height: 18px;
}
.rc-badge--green { background: #dcfce7; color: #16a34a; }
.rc-badge--orange { background: #fff4e5; color: #ea580c; }
.rc-badge--blue { background: #dbeafe; color: #3b82f6; gap: 6px; }
.rc-badge--clickable {
  cursor: pointer;
  -webkit-app-region: no-drag;
  transition: background 0.15s ease;
}
.rc-badge--clickable:hover { background: #ffe5cc; }
.rc-badge-caret {
  margin-left: 2px;
  opacity: 0.75;
}

.rc-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: #3b82f6;
  animation: rc-pulse 1s infinite alternate;
}
@keyframes rc-pulse { 0%{opacity:1} 100%{opacity:.3} }

/* ---- risk list ---- */
.rc-risks {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  padding-right: 4px;
  overflow-y: auto;
  flex: 1;
}

.rc-risk-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.rc-tag {
  flex-shrink: 0;
  padding: 2px 12px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 600;
  border: 1.5px solid;
  white-space: nowrap;
}

.rc-risk-text {
  flex: 1;
  font-size: 15px;
  line-height: 1.45;
  color: #1e293b;
}
</style>
