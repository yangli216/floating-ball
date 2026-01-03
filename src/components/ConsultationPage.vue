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

      <!-- Header Actions -->
      <div class="header-actions">
        <template v-if="currentView === 'consultation'">
             <button class="header-btn primary" @click="handleEndConsultation">结束问诊</button>
        </template>
        <template v-else>
             <button class="header-btn" @click="currentView = 'consultation'">返回</button>
             <button class="header-btn primary" @click="handleComplete">完成</button>
        </template>
      </div>
    </header>

    <div class="content-container" v-if="currentView === 'consultation'">
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
                  <div 
                    v-for="field in section.fields" 
                    :key="field.id" 
                    class="form-field"
                    :id="'field-' + item.key + '-' + field.storageKey"
                    :class="{ 'has-error': validationErrors[item.key + '_' + field.storageKey] }"
                  >
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
        
        <!-- Fixed Submit Button Removed -->
      </main>
      <main v-else class="empty-state">
        <div class="empty-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2z"></path>
          </svg>
        </div>
        <p>请选择左侧症状进行问诊</p>
        <span class="sub-text">支持多选，最多3项</span>
      </main>
    </div>

    <!-- Medical Record View -->
    <div v-else class="medical-record-page">
      
      <div class="record-content">
        <!-- Left: Generated Record -->
        <div class="record-panel left-panel">
          <div class="panel-header">
            <h3>病历详情</h3>
            <button class="icon-btn" @click="copyToClipboard" title="复制全部">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M8 2h12v12h-12zM4 6v14h14M8 6h10M8 10h10M8 14h6"></path>
              </svg>
            </button>
          </div>
          <div class="panel-body">
            <div class="record-field">
              <label>主诉</label>
              <textarea v-model="generatedRecord.chiefComplaint" rows="2"></textarea>
            </div>
            <div class="record-field">
              <label>现病史</label>
              <textarea v-model="generatedRecord.historyOfPresentIllness" rows="12"></textarea>
            </div>
          </div>
        </div>

        <!-- Right: AI Recommendations -->
        <div class="record-panel right-panel">
          <div class="panel-header">
            <h3>智能辅助 (AI)</h3>
            <span class="tag-ai">AI生成中</span>
          </div>
          <div class="panel-body">
            <div class="ai-card">
              <h4>推荐诊断</h4>
              <div class="ai-placeholder">
                <div class="skeleton-line" style="width: 60%"></div>
                <div class="skeleton-line" style="width: 80%"></div>
              </div>
            </div>
            <div class="ai-card">
              <h4>推荐用药</h4>
              <div class="ai-placeholder">
                <div class="skeleton-line" style="width: 90%"></div>
                <div class="skeleton-line" style="width: 70%"></div>
                <div class="skeleton-line" style="width: 50%"></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer Actions Removed -->
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
const currentView = ref<'consultation' | 'record'>('consultation');
const generatedRecord = ref({ chiefComplaint: '', historyOfPresentIllness: '' });

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

const validationErrors = ref<Record<string, boolean>>({});

const handleEndConsultation = () => {
  // 1. Validation
  const errors: string[] = [];
  validationErrors.value = {}; // Reset errors
  let firstErrorFieldId = '';

  selectedSymptoms.value.forEach(s => {
    const data = formData.value[s.key];
    if (data.onsetTime && (!data.onsetTime.inputValue || !data.onsetTime.radioValue)) {
      errors.push(`${s.name}: 请填写发病时间`);
      const errorId = `${s.key}_onsetTime`;
      validationErrors.value[errorId] = true;
      if (!firstErrorFieldId) firstErrorFieldId = `field-${s.key}-onsetTime`;
    }
  });

  if (errors.length > 0) {
    alert("请完善以下信息：\n" + errors.join("\n"));
    
    // Scroll to first error
    if (firstErrorFieldId) {
      const element = document.getElementById(firstErrorFieldId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
    return;
  }

  // 2. Generation Logic
  generateMedicalRecord();

  // 3. Switch View
  currentView.value = 'record';
};

const generateMedicalRecord = () => {
  const complaints: string[] = [];
  const hpiParts: string[] = [];
  
  // -- Chief Complaint --
  selectedSymptoms.value.forEach(s => {
    const data = formData.value[s.key];
    if (data.onsetTime) {
      complaints.push(`${s.name}${data.onsetTime.inputValue}${data.onsetTime.radioValue}`);
    } else {
      complaints.push(s.name);
    }
  });
  const chiefComplaint = complaints.join("，") + "。";

  // -- History of Present Illness --
  // Intro: Patient [duration] ago...
  const firstSymptom = selectedSymptoms.value[0];
  const firstData = formData.value[firstSymptom.key];
  const duration = firstData.onsetTime ? `${firstData.onsetTime.inputValue}${firstData.onsetTime.radioValue}` : '近日';
  
  // Try to find precipitating factor for the first symptom
  let precipitating = '无明显诱因';
  if (firstData.precipitatingFactor) {
    if (Array.isArray(firstData.precipitatingFactor)) {
      if (firstData.precipitatingFactor.length > 0) precipitating = firstData.precipitatingFactor.join('、');
    } else if (firstData.precipitatingFactor !== '不清楚') {
      precipitating = firstData.precipitatingFactor;
    }
  }

  let intro = `患者于${duration}前，${precipitating}出现`;
  const symptomNames = selectedSymptoms.value.map(s => s.name).join('、');
  intro += symptomNames + "。";
  hpiParts.push(intro);

  // Symptom Details
  selectedSymptoms.value.forEach(s => {
    const data = formData.value[s.key];
    let detail = "";
    
    // Custom logic for common symptoms
    if (s.key === 'fever') {
      if (data.maximumBodyTemperature) detail += `最高体温${data.maximumBodyTemperature}℃，`;
      if (data.reliefFactor && data.reliefFactor !== '不清楚') detail += `${data.reliefFactor}，`;
    } else if (s.key === 'cough') {
      if (data.frequencyCharacteristic && data.frequencyCharacteristic !== '不清楚') detail += `${data.frequencyCharacteristic}，`;
      if (data.soundCharacter && data.soundCharacter.length > 0) detail += `${data.soundCharacter.join('、')}，`;
      if (data.colorFeature && data.colorFeature.length > 0) detail += `咳${data.colorFeature.join('、')}，`;
    } else {
      // Generic logic
      // ... iterate fields? Simplified for now
    }
    
    // Add any other checkbox/radio fields generally if not handled above
    // This acts as a catch-all to ensure we don't miss data
    Object.keys(data).forEach(k => {
      if (k === 'onsetTime' || k === 'precipitatingFactor') return; // Handled in intro
      if (s.key === 'fever' && (k === 'maximumBodyTemperature' || k === 'reliefFactor')) return; // Handled above
      if (s.key === 'cough' && (k === 'frequencyCharacteristic' || k === 'soundCharacter' || k === 'colorFeature')) return;
      
      const val = data[k];
      if (Array.isArray(val) && val.length > 0) {
         // Exclude '不清楚', '以上都无'
         const validVals = val.filter(v => v !== '不清楚' && v !== '以上都无' && v !== '无');
         if (validVals.length > 0) detail += `${validVals.join('、')}，`;
      } else if (typeof val === 'string' && val && val !== '不清楚' && val !== '无') {
         detail += `${val}，`;
      }
    });

    if (detail) {
      // Clean up trailing comma
      if (detail.endsWith('，')) detail = detail.slice(0, -1);
      hpiParts.push(`${s.name}表现为：${detail}。`);
    }
  });

  // General Condition
  const genData = formData.value['general'];
  if (genData) {
    const genParts: string[] = [];
    
    // Process standard fields first
    ['spirit', 'sleep', 'appetite'].forEach(k => {
      if (genData[k] && genData[k] !== '其他') genParts.push(genData[k]);
    });

    // Special handling for urination and stool optimization
    const isUrinationNormal = genData['urination'] === '小便正常';
    const isStoolNormal = genData['stool'] === '大便正常';

    if (isUrinationNormal && isStoolNormal) {
      genParts.push('二便正常');
    } else {
      if (genData['urination'] && genData['urination'] !== '其他') genParts.push(genData['urination']);
      if (genData['stool'] && genData['stool'] !== '其他') genParts.push(genData['stool']);
    }

    // Process weight
    if (genData['weight'] && genData['weight'] !== '其他') genParts.push(genData['weight']);

    if (genParts.length > 0) {
      hpiParts.push(`一般情况：${genParts.join('，')}。`);
    }
  }

  generatedRecord.value = {
    chiefComplaint,
    historyOfPresentIllness: hpiParts.join("\n")
  };
};

const copyToClipboard = () => {
  const text = `主诉：${generatedRecord.value.chiefComplaint}\n现病史：\n${generatedRecord.value.historyOfPresentIllness}`;
  navigator.clipboard.writeText(text).then(() => {
    alert('已复制到剪贴板');
  });
};

const handleComplete = () => {
  // Logic to complete the consultation
  alert('病历生成完成');
  // You might want to save data or reset state here
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
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: nowrap;
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
  flex: 1;
  min-width: 0;
  margin-right: 16px;
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

/* Header Actions */
.header-actions {
  margin-left: auto;
  display: flex;
  gap: 12px;
  align-items: center;
  flex-shrink: 0;
}

.header-btn {
  padding: 6px 16px;
  border: 1px solid #d1d5db;
  background: white;
  border-radius: 18px;
  color: #4b5563;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
  font-weight: 500;
}

.header-btn:hover {
  background: #f3f4f6;
  border-color: #9ca3af;
  color: #1f2937;
}

.header-btn.primary {
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: white;
  border: none;
  box-shadow: 0 2px 6px rgba(37, 99, 235, 0.2);
}

.header-btn.primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 10px rgba(37, 99, 235, 0.3);
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
  min-height: 0; /* Fix for flex child scrolling */
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

.has-error .text-input {
  border-color: #ef4444; /* Red-500 */
  box-shadow: 0 0 0 1px rgba(239, 68, 68, 0.2);
  animation: shake 0.5s cubic-bezier(.36,.07,.19,.97) both;
}

.has-error .radio-label {
  border-color: #fecaca;
  background-color: #fef2f2;
}

@keyframes shake {
  10%, 90% { transform: translate3d(-1px, 0, 0); }
  20%, 80% { transform: translate3d(2px, 0, 0); }
  30%, 50%, 70% { transform: translate3d(-4px, 0, 0); }
  40%, 60% { transform: translate3d(4px, 0, 0); }
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

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #9ca3af;
  font-size: 15px;
}

.empty-icon {
  width: 64px;
  height: 64px;
  margin-bottom: 16px;
  color: #cbd5e1;
}

.empty-icon svg {
  width: 100%;
  height: 100%;
}

.sub-text {
  font-size: 13px;
  color: #cbd5e1;
  margin-top: 8px;
}

.action-area {
  padding: 20px 0;
  display: flex;
  justify-content: center;
}

.submit-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: white;
  border: none;
  padding: 10px 16px;
  border-radius: 24px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.2);
  transition: all 0.3s;
}

.submit-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(37, 99, 235, 0.3);
}

.submit-btn svg {
  width: 18px;
  height: 18px;
}

/* Fixed Action Area */
.fixed-action-area {
  position: absolute;
  bottom: 4px;
  right: 24px;
  z-index: 50;
}

/* Medical Record Page Styles */
.medical-record-page {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #f3f4f6;
  overflow: hidden;
  position: relative;
  min-height: 0;
}

/* Footer Actions */
.record-footer {
  height: 60px;
  background: white;
  border-top: 1px solid #e5e7eb;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0 24px;
  gap: 12px;
  z-index: 100;
  flex-shrink: 0;
}

.back-btn-footer {
  padding: 8px 20px;
  border: 1px solid #d1d5db;
  background: white;
  border-radius: 20px;
  color: #4b5563;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}
.back-btn-footer:hover {
  background: #f3f4f6;
  border-color: #9ca3af;
}

.complete-btn {
  padding: 8px 24px;
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: white;
  border: none;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(37, 99, 235, 0.2);
  transition: all 0.2s;
}
.complete-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
}

.record-content {
  flex: 1;
  display: flex;
  gap: 16px; /* Reduced gap */
  padding: 16px; /* Reduced padding */
  overflow: hidden;
  min-height: 0;
}

.record-panel {
  flex: 1;
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid #e5e7eb;
}

.left-panel {
  flex: 0.8; /* Reduced width */
}

.right-panel {
  flex: 1.2; /* Increased width */
  background: #f8fafc;
  border-color: #e2e8f0;
}

.panel-header {
  padding: 10px 16px; /* Compact */
  border-bottom: 1px solid #f0f0f0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: white;
}

.right-panel .panel-header {
  background: #f1f5f9;
}

.panel-header h3 {
  margin: 0;
  font-size: 15px; /* Slightly smaller */
  color: #374151;
  font-weight: 600;
}

.panel-body {
  flex: 1;
  padding: 12px; /* Compact */
  overflow-y: auto;
}

.record-field {
  margin-bottom: 12px; /* Compact */
}

.record-field label {
  display: block;
  font-size: 13px; /* Smaller */
  font-weight: 600;
  color: #4b5563;
  margin-bottom: 6px;
}

.record-field textarea {
  width: 100%;
  padding: 8px 10px; /* Compact */
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 13px;
  line-height: 1.5;
  color: #1f2937;
  resize: vertical;
  box-sizing: border-box;
  font-family: inherit;
  transition: border-color 0.2s;
}

.record-field textarea:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.icon-btn {
  background: transparent;
  border: none;
  color: #6b7280;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.2s;
}

.icon-btn:hover {
  background: #f3f4f6;
  color: #2563eb;
}

.tag-ai {
  background: linear-gradient(135deg, #8b5cf6, #6366f1);
  color: white;
  padding: 2px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}

.ai-card {
  background: white;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.02);
  border: 1px solid #e2e8f0;
}

.ai-card h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: #475569;
}

.ai-placeholder {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.skeleton-line {
  height: 12px;
  background: #f1f5f9;
  border-radius: 6px;
  animation: pulse 1.5s infinite ease-in-out;
}

@keyframes pulse {
  0% { opacity: 0.6; }
  50% { opacity: 0.3; }
  100% { opacity: 0.6; }
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
