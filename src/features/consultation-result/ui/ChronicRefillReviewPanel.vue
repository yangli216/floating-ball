<script setup lang="ts">
import Icon from '@shared/ui/Icon.vue';
import type { ChronicRefillReviewOption, ChronicRefillReviewPlan } from '@/types/consultation';

defineProps<{
  plan: ChronicRefillReviewPlan;
  selections: Record<string, string>;
  expanded: boolean;
  pendingCriticalCount: number;
  reviewedCount: number;
  treatmentReviewTriggered: boolean;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  (event: 'toggle', value: boolean): void;
  (event: 'select', itemId: string, option: ChronicRefillReviewOption): void;
}>();
</script>

<template>
  <section class="refill-review-anchor" @click.stop>
    <button
      class="refill-review-trigger"
      :class="{ 'has-pending': pendingCriticalCount > 0, complete: pendingCriticalCount === 0 }"
      type="button"
      :aria-expanded="expanded"
      @click.stop="emit('toggle', !expanded)"
    >
      <Icon icon="lucide:clipboard-check" size="14" aria-hidden="true" />
      <span>复诊核查</span>
      <span class="refill-review-trigger-count">{{ reviewedCount }}/{{ plan.items.length }}</span>
    </button>

    <section
      v-if="expanded"
      class="refill-review-popover"
      role="dialog"
      aria-label="慢病复诊核查"
      tabindex="-1"
      @keydown.esc.stop="emit('toggle', false)"
    >
      <header class="refill-review-head">
        <div>
          <strong>慢病复诊核查</strong>
          <p>{{ pendingCriticalCount ? `还有 ${pendingCriticalCount} 个重点项待核查` : '重点项已完成' }}</p>
        </div>
        <button class="refill-review-close" type="button" title="关闭" aria-label="关闭慢病复诊核查" @click.stop="emit('toggle', false)">
          <Icon icon="lucide:x" size="17" aria-hidden="true" />
        </button>
      </header>

      <div class="refill-review-body">
        <p class="refill-review-guide">
          {{ plan.summary || '推荐选项仅供快速核查，点击选项后才会作为医生确认事实写入现病史。' }}
        </p>
        <p v-if="treatmentReviewTriggered" class="refill-review-warning">
          <Icon icon="lucide:triangle-alert" size="14" />
          已发现可能影响续方的情况，药品需由医生重新核查并选择。
        </p>

        <div class="refill-review-list">
          <article v-for="(item, index) in plan.items" :key="item.id" class="refill-review-item">
            <div class="refill-review-item-head">
              <span class="refill-review-index">{{ index + 1 }}</span>
              <strong>{{ item.question }}</strong>
              <span v-if="item.priority === 'critical'" class="refill-review-priority">重点</span>
            </div>
            <p v-if="item.description" class="refill-review-description">{{ item.description }}</p>
            <div class="refill-review-options">
              <button
                v-for="option in item.options"
                :key="option.value"
                type="button"
                :class="['refill-review-option', { selected: selections[item.id] === option.value }]"
                :disabled="disabled"
                @click="emit('select', item.id, option)"
              >
                <Icon v-if="selections[item.id] === option.value" icon="lucide:check" size="13" />
                <span>{{ option.label }}</span>
                <small v-if="item.recommendedValue === option.value && !selections[item.id]">推荐</small>
              </button>
            </div>
            <p v-if="item.basis" class="refill-review-basis">依据：{{ item.basis }}</p>
          </article>
        </div>
      </div>
      <footer class="refill-review-footer">
        <span>已核查 {{ reviewedCount }}/{{ plan.items.length }} 项</span>
        <button type="button" @click.stop="emit('toggle', false)">关闭</button>
      </footer>
    </section>
  </section>
</template>

<style scoped>
.refill-review-anchor { position: relative; display: inline-flex; }
.refill-review-trigger { min-height: 30px; padding: 4px 9px; display: inline-flex; align-items: center; gap: 5px; border: 1px solid #93c5fd; border-radius: 9px; color: #1d4ed8; background: #eff6ff; cursor: pointer; white-space: nowrap; }
.refill-review-trigger.has-pending { border-color: #fdba74; color: #9a3412; background: #fff7ed; }
.refill-review-trigger.complete { border-color: #86efac; color: #15803d; background: #f0fdf4; }
.refill-review-trigger-count { min-width: 27px; padding: 1px 5px; border-radius: 999px; background: rgba(255, 255, 255, 0.75); font-size: 10px; text-align: center; }
.refill-review-popover { position: absolute; top: calc(100% + 10px); right: 0; z-index: 40; width: min(620px, 66vw); max-height: min(610px, 70vh); display: flex; flex-direction: column; border: 1px solid #93c5fd; border-radius: 13px; background: var(--voice-surface); box-shadow: 0 18px 42px rgba(15, 23, 42, 0.2); cursor: default; overflow: hidden; }
.refill-review-head { padding: 12px 14px; display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; border-bottom: 1px solid var(--voice-border); background: #f8fbff; }
.refill-review-head strong { color: var(--voice-text); font-size: 15px; }
.refill-review-head p { margin: 3px 0 0; color: var(--voice-text-muted); font-size: 11px; }
.refill-review-close { width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto; border: 0; border-radius: 7px; color: var(--voice-text-muted); background: transparent; cursor: pointer; }
.refill-review-close:hover { color: var(--voice-text); background: var(--voice-surface-muted); }
.refill-review-body { min-height: 0; padding: 11px 13px; overflow-y: auto; }
.refill-review-guide { margin: 0 0 10px; color: var(--voice-text-muted); font-size: 12.5px; line-height: 1.55; }
.refill-review-warning { margin: 0 0 10px; padding: 8px 10px; display: flex; align-items: center; gap: 6px; border-radius: 8px; color: #9a3412; background: #fff7ed; font-size: 12px; }
.refill-review-list { display: flex; flex-direction: column; gap: 10px; }
.refill-review-item { padding: 10px; border: 1px solid var(--voice-border); border-radius: 10px; background: var(--voice-surface); }
.refill-review-item-head { display: flex; align-items: center; gap: 7px; color: var(--voice-text); font-size: 14px; }
.refill-review-index { width: 20px; height: 20px; display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto; border-radius: 50%; color: #1d4ed8; background: #dbeafe; font-size: 11px; }
.refill-review-priority { margin-left: auto; padding: 2px 7px; border-radius: 999px; color: var(--voice-danger); background: var(--voice-danger-soft); font-size: 11px; }
.refill-review-description, .refill-review-basis { margin: 5px 0 0 27px; color: var(--voice-text-muted); font-size: 12px; line-height: 1.5; }
.refill-review-options { margin: 8px 0 0 27px; display: flex; flex-wrap: wrap; gap: 7px; }
.refill-review-option { min-height: 30px; padding: 4px 9px; display: inline-flex; align-items: center; gap: 4px; border: 1px solid var(--voice-border); border-radius: 8px; color: var(--voice-text); background: var(--voice-surface); cursor: pointer; }
.refill-review-option.selected { border-color: #3b82f6; color: #1d4ed8; background: #dbeafe; }
.refill-review-option:disabled { cursor: not-allowed; opacity: 0.58; }
.refill-review-option small { margin-left: 2px; color: #9a6200; font-size: 10px; }
.refill-review-footer { padding: 9px 13px; display: flex; align-items: center; justify-content: space-between; border-top: 1px solid var(--voice-border); color: var(--voice-text-muted); background: #f8fafc; font-size: 11px; }
.refill-review-footer button { min-width: 64px; height: 30px; border: 1px solid #93c5fd; border-radius: 8px; color: #1d4ed8; background: #eff6ff; cursor: pointer; }
</style>
