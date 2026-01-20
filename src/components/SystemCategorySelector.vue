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
.system-category-selector {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.selector-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.selector-header h4 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
}

.clear-btn {
  padding: 4px 12px;
  font-size: 12px;
  background: #f3f4f6;
  border: none;
  border-radius: 4px;
  color: #6b7280;
  cursor: pointer;
  transition: all 0.2s;
}

.clear-btn:hover {
  background: #e5e7eb;
  color: #374151;
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
  padding: 12px 8px;
  background: white;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  min-height: 80px;
}

.system-card:hover {
  border-color: #93c5fd;
  background: #f9fafb;
  transform: translateY(-2px);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.system-card.active {
  background: #eff6ff;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.system-icon {
  width: 32px;
  height: 32px;
  color: #6b7280;
  transition: all 0.2s;
}

.system-card.active .system-icon {
  color: #2563eb;
  transform: scale(1.1);
}

.system-label {
  font-size: 12px;
  font-weight: 500;
  color: #374151;
  text-align: center;
  line-height: 1.2;
}

.system-card.active .system-label {
  color: #2563eb;
  font-weight: 600;
}

.category-symptoms {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px;
  max-height: 300px;
  overflow-y: auto;
}

.category-symptoms h5 {
  margin: 0 0 10px 0;
  font-size: 13px;
  font-weight: 600;
  color: #1f2937;
}

.symptom-count {
  font-weight: 400;
  color: #6b7280;
  font-size: 12px;
}

.symptom-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.symptom-chip {
  padding: 6px 12px;
  font-size: 12px;
  background: #eff6ff;
  border: 1px solid #dbeafe;
  border-radius: 6px;
  color: #2563eb;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.symptom-chip:hover {
  background: #dbeafe;
  border-color: #93c5fd;
  transform: translateY(-1px);
}

.no-symptoms {
  text-align: center;
  padding: 20px;
  font-size: 13px;
  color: #9ca3af;
  background: #f9fafb;
  border-radius: 8px;
}

/* Scrollbar Styling */
.category-symptoms::-webkit-scrollbar {
  width: 6px;
}

.category-symptoms::-webkit-scrollbar-track {
  background: #f3f4f6;
  border-radius: 3px;
}

.category-symptoms::-webkit-scrollbar-thumb {
  background: #d1d5db;
  border-radius: 3px;
}

.category-symptoms::-webkit-scrollbar-thumb:hover {
  background: #9ca3af;
}
</style>
