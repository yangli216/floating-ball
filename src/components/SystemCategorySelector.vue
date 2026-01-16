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
        <div class="system-icon" v-html="system.icon"></div>
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
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2c-1.1 0-2 .9-2 2v3H8c-1.1 0-2 .9-2 2v4c0 1.1.9 2 2 2h2v2h4v-2h2c1.1 0 2-.9 2-2V9c0-1.1-.9-2-2-2h-2V4c0-1.1-.9-2-2-2zm0 2c.55 0 1 .45 1 1v3h-2V5c0-.55.45-1 1-1zm-4 5h8v4h-8V9zm4 6v5l-3-3v4H7v-4l-3 3v-5h4v-2h4v2h4v5l-3-3v4h-2v-4l-3 3v-5z"/>
    </svg>`
  },
  {
    key: 'circulatory',
    label: '循环系统',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
    </svg>`
  },
  {
    key: 'digestive',
    label: '消化系统',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
      <path d="M21 9V7c0-1.65-1.35-3-3-3h-1V3c0-.55-.45-1-1-1H8c-.55 0-1 .45-1 1v1H6C4.35 4 3 5.35 3 7v2c-.55 0-1 .45-1 1v4c0 .55.45 1 1 1v2c0 1.65 1.35 3 3 3h1v1c0 .55.45 1 1 1h8c.55 0 1-.45 1-1v-1h1c1.65 0 3-1.35 3-3v-2c.55 0 1-.45 1-1v-4c0-.55-.45-1-1-1zm-12 8v-7h6v7H9zm10 0c0 .55-.45 1-1 1h-1V10c0-.55-.45-1-1-1H8c-.55 0-1 .45-1 1v7H6c-.55 0-1-.45-1-1V7c0-.55.45-1 1-1h1v1c0 .55.45 1 1 1h8c.55 0 1-.45 1-1V6h1c.55 0 1 .45 1 1v10z"/>
    </svg>`
  },
  {
    key: 'urinary',
    label: '泌尿系统',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C9.79 2 8 3.79 8 6c0 1.85 1.27 3.41 3 3.86V22h2V9.86c1.73-.45 3-2.01 3-3.86 0-2.21-1.79-4-4-4zm0 6c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/>
    </svg>`
  },
  {
    key: 'reproductive',
    label: '生殖系统',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.5 9.5C17.5 6.46 15.04 4 12 4S6.5 6.46 6.5 9.5c0 2.7 1.94 4.93 4.5 5.4V17H9v2h2v2h2v-2h2v-2h-2v-2.1c2.56-.47 4.5-2.7 4.5-5.4zm-9 0C8.5 7.57 10.07 6 12 6s3.5 1.57 3.5 3.5S13.93 13 12 13s-3.5-1.57-3.5-3.5z"/>
    </svg>`
  },
  {
    key: 'nervous',
    label: '神经系统',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-5-9h10v2H7z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>`
  },
  {
    key: 'endocrine',
    label: '内分泌系统',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C8.14 2 5 5.14 5 9c0 3.86 3.14 7 7 7s7-3.14 7-7c0-3.86-3.14-7-7-7zm0 12c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0 2c-3.31 0-6 2.69-6 6h2c0-2.21 1.79-4 4-4s4 1.79 4 4h2c0-3.31-2.69-6-6-6z"/>
    </svg>`
  },
  {
    key: 'motor',
    label: '运动系统',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
      <path d="M13.49 5.48c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm-3.6 13.9l1-4.4 2.1 2v6h2v-7.5l-2.1-2 .6-3c1.3 1.5 3.3 2.5 5.5 2.5v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1l-5.2 2.2v4.7h2v-3.4l1.8-.7-1.6 8.1-4.9-1-.4 2 7 1.4z"/>
    </svg>`
  },
  {
    key: 'other',
    label: '其他',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
    </svg>`
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

.system-icon :deep(svg) {
  width: 100%;
  height: 100%;
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
