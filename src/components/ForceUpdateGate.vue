<template>
  <div class="force-update-gate">
    <div class="force-update-header">
      <div>
        <div class="force-update-title">需要更新后继续使用</div>
        <div class="force-update-subtitle">
          {{ state.message || '当前版本已低于后台要求的最低可用版本。' }}
        </div>
      </div>
      <div class="force-update-channel">{{ state.channelLabel }}</div>
    </div>

    <div class="force-update-meta">
      <div class="meta-item">
        <span>当前版本</span>
        <strong>{{ state.currentVersion || 'unknown' }}</strong>
      </div>
      <div class="meta-item">
        <span>最低可用</span>
        <strong>{{ state.minSupportedVersion || state.latestVersion || '--' }}</strong>
      </div>
      <div class="meta-item">
        <span>最新版本</span>
        <strong>{{ state.latestVersion || '--' }}</strong>
      </div>
    </div>

    <UpdateChecker forced />
  </div>
</template>

<script setup lang="ts">
import UpdateChecker from './UpdateChecker.vue';
import type { ForceUpdateState } from '../services/updatePolicy';

defineProps<{
  state: ForceUpdateState;
}>();
</script>

<style scoped>
.force-update-gate {
  width: 100%;
  min-height: 100%;
  padding: 24px;
  background: var(--color-background-white, #fff);
  color: var(--color-text-primary, #0f172a);
  overflow: auto;
}

.force-update-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.force-update-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--color-text-primary, #0f172a);
}

.force-update-subtitle {
  margin-top: 8px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--color-text-secondary, #475569);
}

.force-update-channel {
  flex: 0 0 auto;
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(29, 158, 117, 0.12);
  color: #13795b;
  font-size: 13px;
  font-weight: 700;
}

.force-update-meta {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 18px;
}

.meta-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  border: 1px solid var(--color-border-light, #e2e8f0);
  border-radius: 8px;
  background: var(--color-background-gray, #f8fafc);
}

.meta-item span {
  font-size: 12px;
  color: var(--color-text-muted, #64748b);
}

.meta-item strong {
  font-size: 15px;
  color: var(--color-text-primary, #0f172a);
  word-break: break-all;
}

@media (max-width: 640px) {
  .force-update-gate {
    padding: 18px;
  }

  .force-update-header {
    flex-direction: column;
  }

  .force-update-meta {
    grid-template-columns: 1fr;
  }
}
</style>
