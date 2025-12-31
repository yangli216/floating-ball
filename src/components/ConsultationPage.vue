<template>
  <div class="consultation-page">
    <!-- Top: Patient Info -->
    <header class="patient-header">
      <div class="patient-card">
        <!-- Avatar -->
        <div class="avatar">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 5C13.66 5 15 6.34 15 8C15 9.66 13.66 11 12 11C10.34 11 9 9.66 9 8C9 6.34 10.34 5 12 5ZM12 19.2C9.5 19.2 7.29 17.92 6 15.98C6.03 13.99 10 12.9 12 12.9C13.99 12.9 17.97 13.99 18 15.98C16.71 17.92 14.5 19.2 12 19.2Z" fill="#ff9a9e"/>
          </svg>
        </div>
        
        <!-- Name -->
        <div class="patient-name">{{ patientInfo.naPi }}</div>
        
        <!-- Basic Info -->
        <div class="patient-basic">
          <span>{{ patientInfo.sdSexText }}</span>
          <span class="divider"></span>
          <span>{{ patientInfo.ageText }}</span>
          <span class="divider"></span>
          <span>{{ patientInfo.sdNationText }} | {{ patientInfo.sdMaritalText }}</span>
        </div>

        <!-- Tags -->
        <div class="tag-blue">自费</div>

        <!-- Contact Info -->
        <div class="contact-info">
          <span>身份证号：{{ patientInfo.idCard }}</span>
          <span>联系电话：{{ patientInfo.mobilePhone }}</span>
        </div>

         <!-- Allergy Tag -->
         <div class="tag-green">过敏史</div>
      </div>
    </header>

    <div class="content-container">
      <!-- Left: Symptom Shortcuts -->
      <aside class="symptom-sidebar">
        <h3>常用症状</h3>
        <div class="search-box">
          <input 
            type="text" 
            v-model="searchQuery" 
            placeholder="搜索症状(支持首字母)..." 
            class="search-input"
          />
        </div>
        <ul class="symptom-list">
          <li 
            v-for="symptom in filteredSymptoms" 
            :key="symptom.key"
            :class="{ active: selectedSymptoms.some(s => s.key === symptom.key) }"
            @click="selectSymptom(symptom)"
          >
            {{ symptom.name }}
          </li>
        </ul>
      </aside>

      <!-- Right: Dynamic Form -->
      <main class="form-container" v-if="selectedSymptoms.length > 0">
        <div class="forms-scroll-area">
          <template v-for="item in renderList" :key="item.key">
            <div class="symptom-form-section">
              <div class="form-header">
                <h2>{{ item.key === 'general' ? item.name : (item.name + ' - 症状属性问诊') }}</h2>
              </div>
      
              <div class="dynamic-form">
                <template v-for="section in item.config.sections" :key="section.id">
                  <!-- Iterate over fields -->
                  <div v-for="field in section.fields" :key="field.id" class="form-field">
                    <label class="field-label">{{ field.label }}</label>
                    
                    <!-- Field Type: input_radio (e.g., OnsetTime) -->
                    <div v-if="field.type === 'input_radio'" class="field-input-radio">
                      <input 
                        type="text" 
                        v-model="formData[item.key][field.storageKey].inputValue" 
                        :placeholder="field.props.placeholder"
                        class="text-input"
                      />
                      <div class="radio-group">
                        <label 
                          v-for="opt in field.props.radioOptions" 
                          :key="opt" 
                          class="radio-label"
                          :class="{ 'is-active': formData[item.key][field.storageKey].radioValue === opt }"
                        >
                          <input 
                            type="radio" 
                            :name="field.id + '_' + item.key" 
                            :value="opt" 
                            v-model="formData[item.key][field.storageKey].radioValue"
                          />
                          {{ opt }}
                        </label>
                      </div>
                    </div>
      
                    <!-- Field Type: radio -->
                    <div v-else-if="field.type === 'radio'" class="field-radio">
                      <div class="radio-group">
                        <label 
                          v-for="opt in field.props.options" 
                          :key="opt" 
                          class="radio-label"
                          :class="{ 'is-active': formData[item.key][field.storageKey] === opt }"
                        >
                          <input 
                            type="radio" 
                            :name="field.id + '_' + item.key" 
                            :value="opt" 
                            v-model="formData[item.key][field.storageKey]"
                          />
                          {{ opt }}
                        </label>
                      </div>
                    </div>
      
                    <!-- Field Type: checkbox -->
                    <div v-else-if="field.type === 'checkbox'" class="field-checkbox">
                      <div class="checkbox-group">
                        <label 
                          v-for="opt in field.props.options" 
                          :key="opt" 
                          class="checkbox-label"
                          :class="{ 'is-active': formData[item.key][field.storageKey]?.includes(opt) }"
                        >
                          <input 
                            type="checkbox" 
                            :value="opt" 
                            :checked="formData[item.key][field.storageKey]?.includes(opt)"
                            @change="(e) => handleCheckboxChange(e, field, item.key)"
                          />
                          {{ opt }}
                        </label>
                      </div>
                    </div>
      
                    <!-- Field Type: number -->
                    <div v-else-if="field.type === 'number'" class="field-number">
                      <input 
                        type="number" 
                        v-model="formData[item.key][field.storageKey]" 
                        :placeholder="field.props.placeholder"
                        class="text-input"
                      />
                      <span v-if="field.props.unit" class="unit">{{ field.props.unit }}</span>
                    </div>
      
                     <!-- Field Type: input -->
                     <div v-else-if="field.type === 'input'" class="field-input">
                      <input 
                        type="text" 
                        v-model="formData[item.key][field.storageKey]" 
                        :placeholder="field.props.placeholder"
                        class="text-input"
                      />
                    </div>
      
                  </div>
                </template>
              </div>
            </div>
          </template>
        </div>
      </main>
      <main v-else class="empty-state">
        <p>请选择左侧症状进行问诊（最多可选3项）</p>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import templatesData from '../assets/templates.json';
import Pinyin from 'tiny-pinyin';

// General Condition Configuration
const generalConditionConfig = {
  key: 'general',
  name: '一般情况问诊',
  config: {
    sections: [
      {
        id: 'general_section',
        title: '一般情况问诊',
        fields: [
          { id: 'spirit', key: 'spirit', label: '精神', type: 'radio', props: { options: ['精神尚可', '精神疲惫', '精神亢奋', '服药后', '其他'] }, storageKey: 'spirit' },
          { id: 'sleep', key: 'sleep', label: '睡眠', type: 'radio', props: { options: ['睡眠正常', '睡眠一般', '睡眠欠佳', '睡眠差', '其他'] }, storageKey: 'sleep' },
          { id: 'appetite', key: 'appetite', label: '食欲', type: 'radio', props: { options: ['食欲正常', '食欲增加', '食欲减退', '其他'] }, storageKey: 'appetite' },
          { id: 'urination', key: 'urination', label: '小便', type: 'radio', props: { options: ['小便正常', '小便增多', '小便减少', '其他'] }, storageKey: 'urination' },
          { id: 'stool', key: 'stool', label: '大便', type: 'radio', props: { options: ['大便正常', '大便增多', '大便减少', '其他'] }, storageKey: 'stool' },
          { id: 'weight', key: 'weight', label: '体重', type: 'radio', props: { options: ['体重无变化', '体重增加', '体重减轻', '其他'] }, storageKey: 'weight' }
        ]
      }
    ]
  }
};

// Mock Patient Data
const patientInfo = ref({
  "idTet": "BSOFTYL",
  "idPi": "766842939207974912",
  "idMpi": "766842939207974912",
  "cdPi": "JG00003125111",
  "naPi": "张虎",
  "sdSex": "2",
  "birthday": "2006-07-11",
  "idCard": "360731200607117442",
  "mobilePhone": "13800138000",
  "sdNation": "1",
  "sdNaty": "001",
  "sdBlood": "5",
  "sdRhBlood": "3",
  "sdMarital": "1",
  "sdCard": "11",
  "ageNum": 19,
  "ageUnit": "Y",
  "ageText": "19岁",
  "sdNationText": "汉族",
  "sdNatyText": "中国",
  "sdMaritalText": "未婚",
  "sdSexText": "女性",
  "sdBloodText": "不详",
  "fgActiveText": "是",
  "sdRhBloodText": "不详",
  "sdCardText": "身份证"
});

const symptoms = ref<any[]>([]);
const selectedSymptoms = ref<any[]>([]);
const formData = ref<Record<string, any>>({});
const searchQuery = ref('');

onMounted(() => {
  symptoms.value = templatesData;
  // Initialize General Condition data
  initFormData(generalConditionConfig);
});

const filteredSymptoms = computed(() => {
  if (!searchQuery.value) return symptoms.value;
  const query = searchQuery.value.toLowerCase();
  return symptoms.value.filter(s => {
    const name = s.name.toLowerCase();
    if (name.includes(query)) return true;
    
    // Pinyin support
    if (Pinyin.isSupported()) {
       const pinyinFull = Pinyin.convertToPinyin(s.name, '', true); // "fare"
       if (pinyinFull.includes(query)) return true;
       
       const pinyinInitials = Pinyin.convertToPinyin(s.name, ' ', true)
          .split(' ')
          .map(w => w[0])
          .join('');
       if (pinyinInitials.includes(query)) return true;
    }
    return false;
  });
});

// Computed list of all items to render (Selected Symptoms + General Condition)
const renderList = computed(() => {
  if (selectedSymptoms.value.length === 0) return [];
  return [...selectedSymptoms.value, generalConditionConfig];
});

const selectSymptom = (symptom: any) => {
  const index = selectedSymptoms.value.findIndex(s => s.key === symptom.key);
  if (index !== -1) {
    // Deselect
    selectedSymptoms.value.splice(index, 1);
    // Optional: clear formData for this symptom? Keeping it might be better for user experience if they re-select.
  } else {
    // Select
    if (selectedSymptoms.value.length >= 3) {
      // Max 3 limit - maybe alert or replace oldest? 
      // Requirement: "最多只能有三个" -> Prevent selection or replace? Usually prevent or auto-remove first.
      // I'll prevent selection for now or replace the last one? 
      // "Support multi-select, but max 3". I will alert or just ignore. 
      // Better UX: Show a toast or shake. For now, I'll just return to enforce limit silently or replace first?
      // Let's replace the first one if full? Or just do nothing? 
      // I'll assume standard behavior: prevent selection.
      return; 
    }
    selectedSymptoms.value.push(symptom);
    // Initialize form data if not exists
    if (!formData.value[symptom.key]) {
      initFormData(symptom);
    }
  }
};

const initFormData = (configItem: any) => {
  const data: Record<string, any> = {};
  configItem.config.sections.forEach((section: any) => {
    section.fields.forEach((field: any) => {
      if (field.type === 'input_radio') {
        data[field.storageKey] = { inputValue: '', radioValue: '' };
      } else if (field.type === 'checkbox') {
        data[field.storageKey] = [];
      } else {
        // Set default value for General Condition or if explicitly requested
        if (configItem.key === 'general' && field.props?.options?.length > 0) {
           data[field.storageKey] = field.props.options[0];
        } else {
           data[field.storageKey] = '';
        }
      }
    });
  });
  // Use reactive set
  formData.value[configItem.key] = data;
};

const handleCheckboxChange = (event: Event, field: any, symptomKey: string) => {
  const target = event.target as HTMLInputElement;
  const value = target.value;
  const currentValues = formData.value[symptomKey][field.storageKey] || [];
  
  if (target.checked) {
    let newValues = [...currentValues, value];
    
    if (field.props.mutualExclusions) {
      const myGroup = field.props.mutualExclusions.find((g: string[]) => g.includes(value));
      if (myGroup) {
           const otherGroups = field.props.mutualExclusions.filter((g: string[]) => g !== myGroup);
           const allOtherValues = otherGroups.flat();
           newValues = newValues.filter((v: string) => !allOtherValues.includes(v));
      }
    }
    
    formData.value[symptomKey][field.storageKey] = newValues;
  } else {
    formData.value[symptomKey][field.storageKey] = currentValues.filter((v: string) => v !== value);
  }
};
</script>

<style scoped>
.consultation-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: #eff6ff; /* Livelier light blue background */
  color: #1f2937;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 14px; /* Base font size */
  overflow: hidden;
}

.patient-header {
  background: linear-gradient(to right, #ffffff, #f0f9ff);
  padding: 8px 16px; /* Reduced padding */
  box-shadow: 0 2px 8px rgba(24, 144, 255, 0.08);
  z-index: 10;
  flex-shrink: 0;
  border-bottom: 1px solid #e6f7ff;
}

.patient-card {
  display: flex;
  align-items: center;
  gap: 12px; /* Reduced gap */
  flex-wrap: wrap;
}

.avatar {
  width: 32px; /* Reduced size */
  height: 32px;
  border-radius: 50%;
  overflow: hidden;
  background: #fff0f1;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #ffe4e6;
}

.avatar svg {
  width: 20px; /* Reduced icon size */
  height: 20px;
}

.patient-name {
  font-size: 16px; /* Slightly reduced */
  font-weight: 700;
  color: #1f2937;
}

.patient-basic {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #4b5563;
}

.divider {
  width: 1px;
  height: 12px;
  background: #d1d5db;
}

.tag-blue {
  background: #dbeafe;
  color: #2563eb;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.tag-green {
  background: #dcfce7;
  color: #16a34a;
  padding: 2px 8px;
  border-radius: 12px; /* Pill shape */
  font-size: 12px;
  font-weight: 500;
}

.contact-info {
  display: flex;
  align-items: center;
  gap: 16px;
  font-size: 14px; /* Increased to 14px */
  color: #6b7280;
  margin-left: auto; /* Push to right if space permits, or just standard flow */
}

@media (max-width: 800px) {
  .contact-info {
    margin-left: 0;
    width: 100%;
    margin-top: 8px;
  }
}

.content-container {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.symptom-sidebar {
  width: 200px; /* Reduced width */
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(10px);
  border-right: 1px solid #e6f7ff;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  box-shadow: 2px 0 8px rgba(0,0,0,0.02);
  z-index: 5;
}

.symptom-sidebar h3 {
  padding: 12px 16px; /* Reduced padding */
  margin: 0;
  font-size: 14px; /* Adjusted to 14px */
  font-weight: 600;
  color: #0c4a6e; /* Dark blue text */
  border-bottom: 1px solid #e6f7ff;
  background: transparent;
  flex-shrink: 0;
}

.search-box {
  padding: 10px; /* Reduced padding */
  border-bottom: 1px solid #e6f7ff;
  background: transparent;
  flex-shrink: 0;
}

.search-input {
  width: 100%;
  padding: 6px 10px; /* Reduced padding */
  border: 1px solid #dbeafe; /* Blue-100 */
  border-radius: 6px;
  font-size: 14px; /* Adjusted to 14px */
  box-sizing: border-box;
  outline: none;
  background: #ffffff;
  transition: all 0.3s;
}

.search-input:focus {
  border-color: #3b82f6; /* Blue-500 */
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}

.symptom-list {
  list-style: none;
  padding: 0;
  margin: 0;
  overflow-y: auto;
  flex: 1;
}

.symptom-list li {
  padding: 8px 16px; /* Reduced padding */
  cursor: pointer;
  border-bottom: 1px solid #f0f9ff;
  transition: all 0.2s;
  color: #4b5563;
  font-size: 14px;
}

.symptom-list li:hover {
  background: #eff6ff;
  color: #2563eb;
  padding-left: 20px; /* Subtle movement */
}

.symptom-list li.active {
  background: #2563eb; /* Dark blue background */
  color: #ffffff; /* White text */
  border-right: none;
  font-weight: 600;
  box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.2);
}

.symptom-list li.active:hover {
  background: #1d4ed8;
  color: #ffffff;
}

.form-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: transparent;
}

.forms-scroll-area {
  flex: 1;
  overflow-y: auto;
  padding: 12px; /* Reduced padding */
  padding-bottom: 80px; /* Extra padding to prevent last item truncation */
}

.symptom-form-section {
  background: rgba(255, 255, 255, 0.9);
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(37, 99, 235, 0.06);
  padding: 12px; /* Ultra compact padding */
  margin-bottom: 12px; /* Ultra compact margin */
  border: 1px solid #dbeafe;
  transition: transform 0.2s;
}

.symptom-form-section:hover {
  transform: translateY(-1px);
  box-shadow: 0 8px 24px rgba(37, 99, 235, 0.1);
}

.form-header {
  background: linear-gradient(to right, #ffffff, #eff6ff);
  margin: -12px -12px 12px -12px; /* Adjusted for new padding */
  padding: 8px 16px; /* Compact padding */
  border-bottom: 1px solid #e0f2fe;
  border-radius: 12px 12px 0 0;
}

.form-header h2 {
  margin: 0;
  font-size: 15px; /* Slightly smaller font */
  font-weight: 600;
  color: #1e3a8a; /* Dark blue */
  display: flex;
  align-items: center;
}

.form-header h2::before {
  content: '';
  display: inline-block;
  width: 4px;
  height: 14px;
  background: #2563eb;
  margin-right: 10px;
  border-radius: 2px;
}

.dynamic-form {
  padding-top: 4px; /* Reduced */
}

.form-field {
  display: flex;
  align-items: flex-start;
  margin-bottom: 10px; /* Compact margin */
  border-bottom: 1px dashed #f0f0f0;
  padding-bottom: 10px; /* Compact padding */
}

.form-field:last-child {
  border-bottom: none;
  margin-bottom: 0;
  padding-bottom: 0;
}

.field-label {
  flex-shrink: 0;
  width: 70px; /* Fixed width for alignment */
  margin-bottom: 0;
  margin-right: 12px;
  font-weight: 600;
  font-size: 14px;
  color: #374151;
  padding-top: 5px; /* Visual alignment with inputs */
  text-align: right; /* Align right for cleaner look */
}

/* Ensure input containers take remaining space */
.field-input-radio,
.radio-group,
.checkbox-group,
.field-number,
.field-input {
  flex: 1;
}

/* Input Radio Style */
.field-input-radio {
  display: flex;
  align-items: center;
  gap: 8px;
}

.text-input {
  padding: 6px 10px; /* Reduced padding */
  border: 1px solid #d1d5db;
  border-radius: 6px;
  width: 100px; /* Default small width */
  outline: none;
  transition: all 0.3s;
  color: #1f2937;
  font-size: 14px; /* Adjusted to 14px */
}

.field-input .text-input {
  width: 100%; /* Full width for standalone inputs */
}

.text-input:focus {
  border-color: #1890ff;
  box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.1);
}

.radio-group, .checkbox-group {
  display: flex;
  flex-wrap: wrap;
  gap: 8px; /* Reduced gap */
}

.radio-label, .checkbox-label {
  display: flex;
  align-items: center;
  gap: 6px; /* Reduced gap */
  cursor: pointer;
  font-size: 14px; /* Adjusted to 14px */
  color: #4b5563;
  padding: 4px 10px; /* Reduced padding */
  border-radius: 20px;
  transition: all 0.2s;
  border: 1px solid #e5e7eb; /* Subtle default border */
  background: #ffffff;
}

.radio-label:hover, .checkbox-label:hover {
  background: #f3f4f6;
  border-color: #d1d5db;
}

.radio-label.is-active, .checkbox-label.is-active {
  background: #eff6ff;
  color: #2563eb;
  border-color: #3b82f6;
  font-weight: 500;
  box-shadow: 0 1px 2px rgba(37, 99, 235, 0.1);
}

.field-number {
  display: flex;
  align-items: center;
  gap: 6px; /* Reduced gap */
}

.unit {
  color: #6b7280;
  font-size: 13px; /* Slightly smaller font */
}

.empty-state {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  color: #60a5fa; /* Blue-400 */
  flex-direction: column;
  gap: 16px;
  background: rgba(255, 255, 255, 0.4);
  border-radius: 12px;
  margin: 24px;
  border: 2px dashed #dbeafe;
}

.empty-state::before {
  content: '';
  display: block;
  width: 120px;
  height: 120px;
  background: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%23bfdbfe" stroke-width="1"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-3 9h.01"/></svg>') no-repeat center/contain;
  opacity: 0.8;
}
</style>
