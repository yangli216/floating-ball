<template>
  <section v-if="alerts.length" class="rigid-block-banner" :class="{ 'has-block': hasBlock }">
    <header class="banner-header">
      <span class="badge" :class="hasBlock ? 'badge-block' : 'badge-warn'">
        {{ hasBlock ? '刚性阻断' : '安全警示' }}
      </span>
      <strong class="title">
        {{ hasBlock
          ? `检测到 ${blockCount} 项刚性安全阻断，提交前必须二次确认`
          : `检测到 ${alerts.length} 项安全警示，请核对` }}
      </strong>
    </header>

    <ul class="alert-list">
      <li v-for="alert in alerts" :key="alert.id" class="alert-item" :class="`severity-${alert.severity}`">
        <div class="alert-line">
          <span class="alert-tag" :class="`tag-${alert.severity}`">
            {{ alert.severity === 'block' ? '阻断' : '警示' }}
          </span>
          <span class="alert-title">{{ alert.title }}</span>
          <button
            v-if="alert.severity === 'block'"
            type="button"
            class="ack-btn"
            :class="{ 'is-ack': isAcknowledged(alert.id) }"
            @click="emit('acknowledge', alert.id)"
          >
            {{ isAcknowledged(alert.id) ? '已确认' : '我已确认' }}
          </button>
        </div>
        <p class="alert-message">{{ alert.message }}</p>
        <p v-if="alert.relatedItems?.length" class="alert-meta">相关：{{ alert.relatedItems.join('、') }}</p>
        <p v-if="alert.evidence" class="alert-meta">依据：{{ alert.evidence }}</p>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { RigidBlockAlert } from '@/services/safetyRules';

const props = defineProps<{
  alerts: RigidBlockAlert[];
  isAcknowledged: (id: string) => boolean;
}>();

const emit = defineEmits<{
  acknowledge: [alertId: string];
}>();

const blockCount = computed(() => props.alerts.filter(a => a.severity === 'block').length);
const hasBlock = computed(() => blockCount.value > 0);
</script>

<style scoped>
.rigid-block-banner {
  margin: 10px 16px 0;
  border-radius: 12px;
  border: 1px solid var(--color-warning, #f5a623);
  background: var(--color-warning-bg, #fff7e6);
  padding: 12px 14px;
  flex-shrink: 0;
}

.rigid-block-banner.has-block {
  border-color: var(--color-error, #d92626);
  background: #fdecec;
}

.banner-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.badge {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 999px;
  color: #fff;
  font-weight: 600;
}

.badge-block { background: var(--color-error, #d92626); }
.badge-warn  { background: var(--color-warning, #f5a623); }

.title {
  font-size: 14px;
  color: var(--color-text-strong, #222);
}

.alert-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.alert-item {
  background: #fff;
  border-radius: 8px;
  padding: 8px 10px;
  border: 1px solid transparent;
}

.alert-item.severity-block { border-color: rgba(217, 38, 38, 0.35); }
.alert-item.severity-warn  { border-color: rgba(245, 166, 35, 0.35); }

.alert-line {
  display: flex;
  align-items: center;
  gap: 8px;
}

.alert-tag {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 4px;
  font-weight: 600;
}

.tag-block { background: var(--color-error, #d92626); color: #fff; }
.tag-warn  { background: var(--color-warning, #f5a623); color: #fff; }

.alert-title {
  font-weight: 600;
  font-size: 13px;
  color: var(--color-text-strong, #222);
  flex: 1;
}

.alert-message {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--color-text, #333);
  line-height: 1.5;
}

.alert-meta {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--color-text-muted, #666);
}

.ack-btn {
  border: 1px solid var(--color-error, #d92626);
  color: var(--color-error, #d92626);
  background: #fff;
  border-radius: 6px;
  padding: 2px 10px;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.ack-btn:hover { background: rgba(217, 38, 38, 0.06); }
.ack-btn.is-ack {
  background: var(--color-error, #d92626);
  color: #fff;
  cursor: default;
}
</style>
