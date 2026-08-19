<script setup lang="ts">
import type {
  ClinicalResultNavigationItem,
  ClinicalResultNavigationKey,
} from '../model/useClinicalResultColumnNavigation';

defineProps<{
  primaryDiagnosisName: string;
  items: ClinicalResultNavigationItem[];
  activeKey: ClinicalResultNavigationKey;
}>();

const emit = defineEmits<{
  navigate: [key: ClinicalResultNavigationKey];
}>();
</script>

<template>
  <aside
    class="clinical-result-column-navigator"
    data-clinical-result-navigator
    aria-label="诊疗建议分区导航"
  >
    <div class="clinical-result-column-context">
      <span>当前主诊断</span>
      <strong :title="primaryDiagnosisName || '尚未选择主诊断'">
        {{ primaryDiagnosisName || '尚未选择' }}
      </strong>
    </div>
    <nav class="clinical-result-column-links" aria-label="诊疗建议内容分区">
      <button
        v-for="item in items"
        :key="item.key"
        class="clinical-result-column-link"
        :class="{ active: item.key === activeKey }"
        type="button"
        :aria-current="item.key === activeKey ? 'location' : undefined"
        @click="emit('navigate', item.key)"
      >
        <span>{{ item.label }}</span>
        <span class="clinical-result-column-count">{{ item.count }}</span>
      </button>
    </nav>
  </aside>
</template>

<style scoped>
.clinical-result-column-navigator {
  position: sticky;
  top: 0;
  z-index: 9;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex: 0 0 auto;
  min-width: 0;
  padding: 9px 12px;
  border: 1px solid var(--voice-border);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 6px 14px rgba(15, 23, 42, 0.08);
  backdrop-filter: blur(10px);
}

.clinical-result-column-context {
  display: flex;
  align-items: baseline;
  gap: 7px;
  min-width: 0;
}

.clinical-result-column-context > span {
  flex: 0 0 auto;
  color: var(--voice-text-muted);
  font-size: 12px;
}

.clinical-result-column-context > strong {
  min-width: 0;
  max-width: 180px;
  overflow: hidden;
  color: var(--voice-text);
  font-size: 13px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.clinical-result-column-links {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
}

.clinical-result-column-links::-webkit-scrollbar {
  display: none;
}

.clinical-result-column-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: 0 0 auto;
  min-height: 30px;
  padding: 4px 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--voice-text-muted);
  font-size: 12.5px;
  cursor: pointer;
}

.clinical-result-column-link:hover {
  background: var(--voice-surface-hover);
  color: var(--voice-text);
}

.clinical-result-column-link.active {
  background: var(--voice-accent-soft);
  color: var(--voice-accent-strong);
  font-weight: 650;
}

.clinical-result-column-link:focus-visible {
  outline: 2px solid var(--voice-accent);
  outline-offset: 1px;
}

.clinical-result-column-count {
  min-width: 16px;
  color: inherit;
  font-size: 11.5px;
  text-align: center;
}

@media (max-width: 1100px) {
  .clinical-result-column-navigator {
    align-items: flex-start;
    flex-direction: column;
    gap: 6px;
  }

  .clinical-result-column-links {
    justify-content: flex-start;
    width: 100%;
  }
}

@media (max-width: 900px) {
  .clinical-result-column-navigator {
    position: static;
  }
}
</style>
