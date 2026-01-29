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
  height: 100%;
  padding: 8px;
}

.selector-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.selector-header h4 {
  margin: 0;
  font-size: 13px;
  font-weight: var(--font-weight-semibold);
  color: rgba(255, 255, 255, 0.9);
}

.clear-btn {
  padding: 3px 10px;
  font-size: 11px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  transition: all var(--duration-normal) var(--ease-out);
}

.clear-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  color: rgba(255, 255, 255, 0.9);
  border-color: rgba(255, 255, 255, 0.3);
}

.systems-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  flex-shrink: 0;
}

.system-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 8px 6px;
  background: rgba(255, 255, 255, 0.05);
  border: 2px solid rgba(255, 255, 255, 0.1);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--duration-normal) var(--ease-out);
  min-height: 70px;
}

.system-card:hover {
  border-color: rgba(14, 165, 233, 0.5);
  background: rgba(14, 165, 233, 0.1);
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
}

.system-card.active {
  background: rgba(14, 165, 233, 0.2);
  border-color: rgba(14, 165, 233, 0.6);
  box-shadow: 0 0 0 2px rgba(14, 165, 233, 0.3);
}

.system-icon {
  width: 28px;
  height: 28px;
  color: rgba(255, 255, 255, 0.6);
  transition: all var(--duration-normal) var(--ease-out);
}

.system-card.active .system-icon {
  color: rgba(125, 211, 252, 1);
  transform: scale(1.1);
}

.system-label {
  font-size: 11px;
  font-weight: var(--font-weight-medium);
  color: rgba(255, 255, 255, 0.7);
  text-align: center;
  line-height: 1.2;
}

.system-card.active .system-label {
  color: rgba(125, 211, 252, 1);
  font-weight: var(--font-weight-semibold);
}

.category-symptoms {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: var(--radius-md);
  padding: 10px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.category-symptoms h5 {
  margin: 0 0 8px 0;
  font-size: 12px;
  font-weight: var(--font-weight-semibold);
  color: rgba(255, 255, 255, 0.9);
  flex-shrink: 0;
}

.symptom-count {
  font-weight: var(--font-weight-normal);
  color: rgba(255, 255, 255, 0.6);
  font-size: 11px;
}

.symptom-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-content: flex-start;
}

.symptom-chip {
  padding: 5px 10px;
  font-size: 11px;
  background: rgba(14, 165, 233, 0.15);
  border: 1px solid rgba(14, 165, 233, 0.3);
  border-radius: 6px;
  color: rgba(125, 211, 252, 1);
  cursor: pointer;
  transition: all var(--duration-normal) var(--ease-out);
  white-space: nowrap;
}

.symptom-chip:hover {
  background: rgba(14, 165, 233, 0.25);
  border-color: rgba(14, 165, 233, 0.5);
  transform: translateY(-1px);
}

.no-symptoms {
  text-align: center;
  padding: 15px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  background: rgba(255, 255, 255, 0.05);
  border-radius: var(--radius-md);
}

/* Scrollbar Styling */
.category-symptoms::-webkit-scrollbar {
  width: 6px;
}

.category-symptoms::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 3px;
}

.category-symptoms::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 3px;
}

.category-symptoms::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}
</style>
