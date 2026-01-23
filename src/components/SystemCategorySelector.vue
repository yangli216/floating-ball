<template>
  <div class="system-category-selector">
    <div class="selector-header">
      <h4>选择症状</h4>
      <button class="clear-btn" @click="clearSelection" v-if="selectedCategories.length > 0">
        清空
      </button>
    </div>

    <div class="systems-grid">
      <div
        v-for="system in systems"
        :key="system.key"
        :class="['system-card', { active: isSelected(system.key) }]"
        @click="toggleSystem(system.key)"
      >
        <div class="system-icon">
          <Icon :icon="system.icon" size="32" />
        </div>
        <span class="system-label">{{ system.label }}</span>
      </div>
    </div>

    <!-- Selected Categories Symptoms -->
    <div v-if="selectedCategories.length > 0 && filteredSymptoms.length > 0" class="category-symptoms">
      <h5>
        已选择 {{ selectedCategories.length }} 个系统
        <span class="symptom-count">({{ filteredSymptoms.length }} 个症状)</span>
      </h5>
      <div class="symptom-chips">
        <button
          v-for="symptom in filteredSymptoms"
          :key="symptom.key"
          class="symptom-chip"
          @click="handleSymptomClick(symptom)"
        >
          {{ symptom.name }}
        </button>
      </div>
    </div>

    <div v-else-if="selectedCategories.length > 0 && filteredSymptoms.length === 0" class="no-symptoms">
      所选系统暂无相关症状
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, PropType } from 'vue';
import Icon from './Icon.vue';

interface Symptom {
  key: string;
  name: string;
  bodyParts: string[];
  systemCategory: string[];
}

const props = defineProps({
  symptoms: {
    type: Array as PropType<Symptom[]>,
    required: true
  }
});

const emit = defineEmits<{
  (e: 'select-symptom', symptom: Symptom): void;
}>();

const handleSymptomClick = (symptom: Symptom) => {
  emit('select-symptom', symptom);
};

const selectedCategories = ref<string[]>([]);

const systems = [
  {
    key: 'respiratory',
    label: '呼吸系统',
    icon: 'healthicons:lungs'
  },
  {
    key: 'circulatory',
    label: '循环系统',
    icon: 'mdi:heart-pulse'
  },
  {
    key: 'digestive',
    label: '消化系统',
    icon: 'healthicons:stomach'
  },
  {
    key: 'urinary',
    label: '泌尿系统',
    icon: 'healthicons:kidneys'
  },
  {
    key: 'reproductive',
    label: '生殖系统',
    icon: 'mdi:gender-male-female'
  },
  {
    key: 'nervous',
    label: '神经系统',
    icon: 'mdi:brain'
  },
  {
    key: 'endocrine',
    label: '内分泌系统',
    icon: 'mdi:flask'
  },
  {
    key: 'motor',
    label: '运动系统',
    icon: 'mdi:run'
  },
  {
    key: 'other',
    label: '其他',
    icon: 'mdi:dots-horizontal-circle'
  }
];

const toggleSystem = (key: string) => {
  const index = selectedCategories.value.indexOf(key);
  if (index > -1) {
    selectedCategories.value.splice(index, 1);
  } else {
    selectedCategories.value.push(key);
  }
};

const isSelected = (key: string) => {
  return selectedCategories.value.includes(key);
};

const clearSelection = () => {
  selectedCategories.value = [];
};

const filteredSymptoms = computed(() => {
  if (selectedCategories.value.length === 0) return [];
  return props.symptoms.filter(symptom =>
    symptom.systemCategory.some(cat => selectedCategories.value.includes(cat))
  );
});
</script>

<style scoped>
/**
 * 组件样式规范：
 * - 所有颜色使用 var(--color-*) 语义变量
 * - 间距使用 var(--space-*)
 * - 动画使用 var(--duration-*) 和 var(--ease-*)
 * - 参考: src/styles/design-tokens.css
 */

.system-category-selector {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.selector-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.selector-header h4 {
  margin: 0;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-strong);
}

.clear-btn {
  padding: var(--space-xs) var(--space-md);
  font-size: var(--font-size-xs);
  background: var(--color-background-gray);
  border: none;
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all var(--duration-normal) var(--ease-out);
}

.clear-btn:hover {
  background: var(--color-border-light);
  color: var(--color-text-medium);
}

.systems-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.system-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: var(--space-md) var(--space-sm);
  background: var(--color-background-white);
  border: 2px solid var(--color-border-light);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--duration-normal) var(--ease-out);
  min-height: 80px;
}

.system-card:hover {
  border-color: var(--color-primary, #0891B2);
  background: var(--color-background-gray);
  transform: translateY(-2px);
  box-shadow: var(--shadow-sm);
}

.system-card.active {
  background: var(--color-background, #ECFEFF);
  border-color: var(--color-primary, #0891B2);
  box-shadow: 0 0 0 3px var(--color-primary-100);
}

.system-icon {
  width: 32px;
  height: 32px;
  color: var(--color-text-muted);
  transition: all var(--duration-normal) var(--ease-out);
}

.system-card.active .system-icon {
  color: var(--color-primary, #0891B2);
  transform: scale(1.1);
}

.system-label {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-medium);
  text-align: center;
  line-height: 1.2;
}

.system-card.active .system-label {
  color: var(--color-primary, #0891B2);
  font-weight: var(--font-weight-semibold);
}

.category-symptoms {
  background: var(--color-background-white);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-md);
  padding: var(--space-md);
  max-height: 300px;
  overflow-y: auto;
}

.category-symptoms h5 {
  margin: 0 0 10px 0;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-strong);
}

.symptom-count {
  font-weight: var(--font-weight-normal);
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.symptom-chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
}

.symptom-chip {
  padding: 6px var(--space-md);
  font-size: var(--font-size-xs);
  background: var(--color-background, #ECFEFF);
  border: 1px solid var(--color-primary, #0891B2);
  border-radius: var(--radius-md);
  color: var(--color-primary, #0891B2);
  cursor: pointer;
  transition: all var(--duration-normal) var(--ease-out);
  white-space: nowrap;
}

.symptom-chip:hover {
  background: var(--color-primary-100);
  border-color: var(--color-primary, #0891B2);
  transform: translateY(-1px);
}

.no-symptoms {
  text-align: center;
  padding: var(--space-lg);
  font-size: var(--font-size-sm);
  color: var(--color-text-disabled);
  background: var(--color-background-gray);
  border-radius: var(--radius-md);
}

/* Scrollbar Styling */
.category-symptoms::-webkit-scrollbar {
  width: 6px;
}

.category-symptoms::-webkit-scrollbar-track {
  background: var(--color-background-gray);
  border-radius: 3px;
}

.category-symptoms::-webkit-scrollbar-thumb {
  background: var(--color-border-medium);
  border-radius: 3px;
}

.category-symptoms::-webkit-scrollbar-thumb:hover {
  background: var(--color-border-strong);
}
</style>
