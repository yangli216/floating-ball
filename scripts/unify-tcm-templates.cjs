#!/usr/bin/env node
/**
 * 统一中医模板格式脚本
 * 将 tcm-templates.json 转换为与 templates.json 相同的结构
 */

const fs = require('fs');
const path = require('path');

const TCM_TEMPLATE_PATH = path.join(__dirname, '../src/assets/tcm-templates.json');
const OUTPUT_PATH = path.join(__dirname, '../src/assets/tcm-templates-unified.json');

// 读取中医模板
const tcmData = JSON.parse(fs.readFileSync(TCM_TEMPLATE_PATH, 'utf8'));

// 中医系统分类映射到西医系统
const TCM_TO_WESTERN_CATEGORY = {
  '痛证': ['nervous'],
  '神志病': ['nervous'],
  '脾胃病': ['digestive'],
  '肺系病': ['respiratory'],
  '心系病': ['circulatory'],
  '肝胆病': ['digestive'],
  '肾系病': ['urinary'],
  '气血津液': ['circulatory'],
  '外感病': ['respiratory'],
  '妇科病': ['reproductive']
};

// 生成唯一ID
let globalIdCounter = Date.now();
const generateId = () => String(globalIdCounter++);

// 转换选项：对象数组 -> 字符串数组
const normalizeOptions = (options) => {
  if (!Array.isArray(options)) return options;

  return options.map(opt => {
    if (typeof opt === 'string') return opt;
    // 从对象提取 label
    return opt.label || opt.value || String(opt);
  });
};

// 转换字段
const transformField = (field, sectionId, symptomKey) => {
  const fieldId = generateId();
  const storageKey = field.key;

  const transformed = {
    id: fieldId,
    key: field.key,
    label: field.label,
    type: field.type,
    props: {
      ...field.props,
      // 转换选项格式
      options: field.props?.options ? normalizeOptions(field.props.options) : field.props?.options,
      radioOptions: field.props?.radioOptions ? normalizeOptions(field.props.radioOptions) : field.props?.radioOptions
    },
    storageKey: storageKey
  };

  // 添加 textGenConfig（根据字段类型自动生成）
  if (field.type === 'input_radio' && field.key === 'onsetTime') {
    transformed.textGenConfig = {
      targets: ['chiefComplaint'],
      template: '{value}'
    };
  } else if (['checkbox', 'radio'].includes(field.type)) {
    transformed.textGenConfig = {
      targets: ['historyOfPresentIllness'],
      template: `{label}：{value}`,
      separator: '、'
    };
  } else if (field.type === 'number') {
    transformed.textGenConfig = {
      targets: ['historyOfPresentIllness'],
      template: `{label}：{value}${field.props?.unit || ''}`
    };
  }

  return transformed;
};

// 转换section
const transformSection = (section, symptomKey, sectionIndex) => {
  const sectionId = `${symptomKey}_section_${sectionIndex}`;

  return {
    id: sectionId,
    title: section.title,
    description: section.description || '',
    fields: section.fields.map((field, idx) => transformField(field, sectionId, symptomKey))
  };
};

// 转换症状
const transformSymptom = (symptom, index) => {
  const systemCategory = TCM_TO_WESTERN_CATEGORY[symptom.tcmCategory] || ['other'];

  return {
    id: generateId(),
    key: symptom.key,
    name: symptom.name,
    description: `中医${symptom.tcmCategory}`,
    isCommonSymptom: symptom.priority === 'P0',
    systemCategory: systemCategory,
    bodyParts: [],
    customScript: '',
    config: {
      title: '智能问诊',
      sections: symptom.config.sections.map((section, idx) =>
        transformSection(section, symptom.key, idx)
      )
    },
    applicablePopulation: {
      genders: [],
      ageGroups: []
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    // 保留中医特有字段（可选）
    tcmMetadata: {
      category: symptom.tcmCategory,
      relatedMeridians: symptom.relatedMeridians,
      relatedOrgans: symptom.relatedOrgans,
      diagnosis: symptom.tcmDiagnosis
    }
  };
};

// 转换整个模板
const unifiedSymptoms = tcmData.symptoms.map((symptom, index) =>
  transformSymptom(symptom, index)
);

// 写入文件
fs.writeFileSync(OUTPUT_PATH, JSON.stringify(unifiedSymptoms, null, 2), 'utf8');

console.log('✅ 中医模板统一完成！');
console.log(`   输出文件: ${OUTPUT_PATH}`);
console.log(`   症状数量: ${unifiedSymptoms.length}`);
console.log(`   总字段数: ${unifiedSymptoms.reduce((sum, s) =>
  sum + s.config.sections.reduce((s2, sec) => s2 + sec.fields.length, 0), 0
)}`);
console.log('\n📋 后续步骤:');
console.log('   1. 检查生成的文件');
console.log('   2. 备份原文件: mv src/assets/tcm-templates.json src/assets/tcm-templates.json.bak');
console.log('   3. 替换文件: mv src/assets/tcm-templates-unified.json src/assets/tcm-templates.json');
