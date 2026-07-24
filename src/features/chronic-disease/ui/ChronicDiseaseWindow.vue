<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { emitTo } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import Icon from '@shared/ui/Icon.vue';
import { useTauriWindowEventListeners } from '@shared/composables/useTauriWindowEventListeners';
import {
  CHRONIC_DISEASE_WINDOW_READY_EVENT,
  CHRONIC_DISEASE_WINDOW_UPDATE_EVENT,
} from '../api/chronicDiseaseWindowService';
import type { ChronicDiseaseWindowPayload } from '../types';
import { buildChronicDiseaseViewKey } from '../lib/chronicDiseaseWindowSession';
import AnnualAssessmentView from './AnnualAssessmentView.vue';
import ClinicalPathView from './ClinicalPathView.vue';
import FollowUpForm from './FollowUpForm.vue';
import HealthPrescriptionView from './HealthPrescriptionView.vue';

const appWindow = getCurrentWindow();
const MAIN_WINDOW_LABEL = 'main';
const payload = ref<ChronicDiseaseWindowPayload | null>(null);
const viewKey = computed(() => payload.value ? buildChronicDiseaseViewKey(payload.value) : 'empty');

const title = computed(() => {
  if (!payload.value) return '慢病管理';
  switch (payload.value.kind) {
    case 'follow-up': return '慢病随访';
    case 'path': return '临床诊疗路径';
    case 'prescription': return '个性化健康处方';
    case 'assessment': return `${new Date().getFullYear()} 年度居民健康评估`;
    default: return '慢病管理';
  }
});

const eyebrow = computed(() => {
  if (!payload.value) return 'CHRONIC DISEASE ASSISTANT';
  switch (payload.value.kind) {
    case 'follow-up': return '受控模板 · 医生确认后保存';
    case 'path': return '已发布路径 · 节点可交互';
    case 'prescription': return 'AI 草稿 · 医生逐项确认';
    case 'assessment': return '只读聚合 · 数据可追溯';
    default: return 'CHRONIC DISEASE ASSISTANT';
  }
});

const listeners = useTauriWindowEventListeners({
  window: appWindow,
  logContext: 'ChronicDiseaseWindow',
  listeners: [{
    eventName: CHRONIC_DISEASE_WINDOW_UPDATE_EVENT,
    handler: ({ payload: nextPayload }) => {
      payload.value = nextPayload as ChronicDiseaseWindowPayload;
    },
  }],
});

async function closeWindow(): Promise<void> {
  try {
    await appWindow.close();
  } catch (error) {
    console.warn('[ChronicDiseaseWindow] close failed, fallback to hide:', error);
    await appWindow.hide();
  }
}

async function handleHeaderMouseDown(event: MouseEvent): Promise<void> {
  const target = event.target;
  if (target instanceof Element && target.closest('button')) return;
  await appWindow.startDragging();
}

onMounted(async () => {
  await listeners.registerListeners();
  await emitTo(MAIN_WINDOW_LABEL, CHRONIC_DISEASE_WINDOW_READY_EVENT, { label: appWindow.label });
});
</script>

<template>
  <section class="chronic-window">
    <header class="window-header" @mousedown.left="handleHeaderMouseDown">
      <div>
        <p>{{ eyebrow }}</p>
        <h1>{{ title }}</h1>
      </div>
      <button type="button" aria-label="关闭慢病业务窗口" title="关闭" @click.stop="closeWindow">
        <Icon icon="lucide:x" size="19" />
      </button>
    </header>

    <div v-if="payload" class="window-content">
      <FollowUpForm v-if="payload.kind === 'follow-up'" :key="viewKey" :payload="payload" />
      <ClinicalPathView v-else-if="payload.kind === 'path'" :key="viewKey" :payload="payload" />
      <HealthPrescriptionView v-else-if="payload.kind === 'prescription'" :key="viewKey" :payload="payload" />
      <AnnualAssessmentView v-else :key="viewKey" :payload="payload" />
    </div>

    <div v-else class="waiting-state">
      <Icon icon="lucide:loader-circle" size="28" class="spinning" />
      <strong>正在接收患者上下文…</strong>
      <span>业务窗口完成握手后会在此处显示内容。</span>
    </div>
  </section>
</template>

<style scoped>
.chronic-window {
  width: 100vw;
  height: 100vh;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  overflow: hidden;
  color: #1e293b;
  background: #fff;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", "PingFang SC", Arial, sans-serif;
}

.window-header {
  min-height: 70px;
  padding: 13px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fff;
  border-bottom: 1px solid #e2e8f0;
  cursor: grab;
}

.window-header:active { cursor: grabbing; }
.window-header p { margin: 0 0 4px; color: #64748b; font-size: 9px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; }
.window-header h1 { margin: 0; color: #1e293b; font-size: 21px; }
.window-header button { width: 36px; height: 36px; display: grid; place-items: center; color: #64748b; background: #fff; border: 1px solid #e2e8f0; border-radius: 7px; }
.window-header button:hover { color: #2b7fe3; background: #f0f6ff; }
.window-content { min-height: 0; overflow: hidden; }
.waiting-state { display: grid; place-content: center; justify-items: center; gap: 8px; color: #94a3b8; }
.waiting-state strong { color: #475569; font-size: 14px; }
.waiting-state span { font-size: 11px; }
.spinning { animation: spin .9s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
