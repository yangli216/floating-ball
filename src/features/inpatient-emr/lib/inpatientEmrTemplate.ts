import type {
  InpatientEmrContext,
  InpatientEmrFieldRule,
  InpatientEmrTemplateField,
  InpatientEmrTemplateParseResult,
} from '../types';

function normalizeText(value: string | null | undefined): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function hashText(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index);
    hash |= 0;
  }
  return `tpl_${Math.abs(hash).toString(36)}_${value.length}`;
}

function getTemplateArticle(node: Element): string {
  let cursor: Element | null = node;
  while (cursor) {
    const article = cursor.getAttribute('data-article');
    if (article) return article;
    cursor = cursor.parentElement;
  }
  return '';
}

function inferFieldMeaning(id: string, name: string, defaultValue?: string): string {
  const text = `${id} ${name} ${defaultValue || ''}`;
  if (text.includes('医疗机构')) return '病历页眉中的医疗机构名称，通常由机构配置或 HIS 上下文带入';
  if (text.includes('病历标题')) return '病历文书标题，通常跟随模板类型';
  if (text.includes('姓名') && !text.includes('医师')) return '患者姓名，来自住院登记信息';
  if (text.includes('科室')) return '患者当前住院科室或病区，来自住院登记信息';
  if (text.includes('床')) return '患者住院床号，来自住院登记信息';
  if (text.includes('住院号')) return '患者住院号，来自住院登记信息';
  if (text.includes('操作时间') || text.includes('业务时间')) return '本次病程记录的记录时间，默认使用当前业务时间';
  if (text.includes('操作人员') || text.includes('查房医师')) return '查房或书写医生姓名，来自登录医生或住院登记医生信息';
  if (text.includes('操作名称') || text.includes('病程记录名称')) return '病程记录类型名称，通常跟随模板文书类型';
  if (id === '病程记录文本' || text.includes('记录文本')) return '病程记录正文，适合结合住院登记、诊断、医嘱和体温单生成';
  if (text.includes('医师签名')) return '医师签名字段，应由医生确认或电子签名流程完成';
  return '模板字段，需结合模板上下文和 HIS 字段映射确认含义';
}

function isAiSuitableField(id: string, name: string): boolean {
  const text = `${id} ${name}`;
  if (
    text.includes('页眉')
    || text.includes('姓名')
    || text.includes('科室')
    || text.includes('床')
    || text.includes('住院号')
    || text.includes('日期')
    || text.includes('时间')
    || text.includes('天数')
    || text.includes('签名')
    || text.includes('操作人员')
    || text.includes('操作名称')
    || text.includes('诊断')
  ) {
    return false;
  }

  return [
    '病程记录文本',
    '记录正文',
    '入院情况',
    '诊疗经过',
    '出院情况',
    '治疗结果',
    '出院医嘱',
    '病情分析',
    '诊疗计划',
    '处理意见',
  ].some((keyword) => text.includes(keyword));
}

function buildFieldRule(field: Pick<InpatientEmrTemplateField, 'id' | 'name'>): InpatientEmrFieldRule {
  if (isAiSuitableField(field.id, field.name)) {
    return {
      source: 'ai',
      dependencies: ['registration', 'registration.diagnoses', 'orders', 'temperatureChart'],
      promptIntent: field.id.includes('出院') ? 'inpatientDischargeRecordSection' : 'inpatientRecordSection',
      constraints: [
        '仅依据已提供 HIS 数据生成，不补充未出现的检查结果或症状',
        '围绕字段含义生成对应段落，不跨字段混写其他模板项',
        '合理引用住院登记、诊断、医嘱和体温单中的客观信息',
        '保留医生最终审核空间，避免给出绝对疗效判断',
      ],
    };
  }

  if (field.id.startsWith('页眉') || field.id === '病程记录操作时间' || field.id === '病程记录操作人员') {
    return {
      source: 'his_or_system',
      dependencies: ['registration', 'currentDoctor', 'currentTime'],
      constraints: ['按 HIS/系统事实填充，不由 AI 自由改写'],
    };
  }

  if (field.id === '病程记录操作名称文本') {
    return {
      source: 'fixed',
      value: '日常病程记录',
      constraints: ['跟随模板文书类型或医生选择项'],
    };
  }

  if (field.id === '医师签名') {
    return {
      source: 'doctor_signature',
      dependencies: ['currentDoctor', 'signatureWorkflow'],
      constraints: ['AI 不生成签名，由医生确认或电子签名系统写入'],
    };
  }

  return {
    source: 'manual_or_his',
    dependencies: ['registration'],
    constraints: ['未知字段先保守映射，必要时由医生确认'],
  };
}

export function parseInpatientEmrTemplate(htmlContent: string): InpatientEmrTemplateParseResult {
  const cacheKey = hashText(htmlContent);
  const doc = new DOMParser().parseFromString(htmlContent, 'text/html');
  const seen = new Set<string>();
  const fields = Array.from(doc.querySelectorAll('[data-id][data-type]'))
    .map((node): InpatientEmrTemplateField => {
      const id = node.getAttribute('data-id') || '';
      const name = node.getAttribute('data-name') || node.getAttribute('title') || id;
      const defaultValue = node.getAttribute('data-default') || normalizeText(node.textContent);
      const base = {
        id,
        name,
        article: getTemplateArticle(node),
        type: node.getAttribute('data-type') || 'text',
        readonly: node.getAttribute('data-readonly') === 'true',
        key: node.getAttribute('data-key') === 'true',
        defaultValue,
        meaning: inferFieldMeaning(id, name, defaultValue),
        aiSuitable: isAiSuitableField(id, name),
      };
      return {
        ...base,
        rule: buildFieldRule(base),
      };
    })
    .filter((field) => {
      if (!field.id || seen.has(field.id)) return false;
      seen.add(field.id);
      return true;
    });

  return { cacheKey, cacheHit: false, fields };
}

function formatDateMinute(value: Date = new Date()): string {
  const pad = (num: number) => String(num).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

export function fillInpatientEmrTemplateHtml(htmlContent: string, values: Record<string, string>): string {
  const doc = new DOMParser().parseFromString(htmlContent, 'text/html');
  Array.from(doc.querySelectorAll('[data-id][data-type]')).forEach((node) => {
    const id = node.getAttribute('data-id') || '';
    if (!Object.prototype.hasOwnProperty.call(values, id)) return;
    const valueNode = node.querySelector('.tag-value') || node;
    valueNode.textContent = values[id] || '';
  });
  return doc.body.innerHTML;
}

export function buildEditableInpatientEmrPreviewHtml(
  htmlContent: string,
  values: Record<string, string>,
  fields: InpatientEmrTemplateField[],
): string {
  const doc = new DOMParser().parseFromString(htmlContent, 'text/html');
  const aiFieldIds = new Set(fields.filter((field) => field.aiSuitable).map((field) => field.id));
  const fieldNameMap = new Map(fields.map((field) => [field.id, field.name || field.id]));

  Array.from(doc.querySelectorAll('[data-id][data-type]')).forEach((node) => {
    const id = node.getAttribute('data-id') || '';
    const valueNode = node.querySelector('.tag-value') || node;
    if (Object.prototype.hasOwnProperty.call(values, id)) {
      valueNode.textContent = values[id] || '';
    }

    valueNode.setAttribute('data-inpatient-emr-field-id', id);
    valueNode.setAttribute('data-inpatient-emr-field-name', fieldNameMap.get(id) || id);
    valueNode.classList.add('inpatient-emr-field');

    if (aiFieldIds.has(id)) {
      valueNode.setAttribute('contenteditable', 'true');
      valueNode.setAttribute('role', 'textbox');
      valueNode.setAttribute('aria-label', `${fieldNameMap.get(id) || id} AI 生成内容`);
      valueNode.setAttribute('spellcheck', 'false');
      valueNode.classList.add('inpatient-emr-field--ai');
    } else {
      valueNode.setAttribute('contenteditable', 'false');
      valueNode.classList.add('inpatient-emr-field--readonly');
    }
  });

  return doc.body.innerHTML;
}

export function buildDefaultFieldValues(
  fields: InpatientEmrTemplateField[],
  context: InpatientEmrContext,
): Record<string, string> {
  const registration = context.registration;
  const firstDiagnosis = registration?.diagnoses?.find((item) => item.isPrimary) || registration?.diagnoses?.[0];
  const diagnosisText = firstDiagnosis?.name || registration?.admissionDiagnosis || '';
  const doctorName = registration?.attendingDoctorName || '';
  const fieldIds = new Set(fields.map((field) => field.id));
  const values: Record<string, string> = {};
  const setIfPresent = (id: string, value: string): void => {
    if (fieldIds.has(id)) {
      values[id] = value;
    }
  };

  setIfPresent('页眉医疗机构名称', String(registration?.raw?.idOrgText || registration?.raw?.naOrg || '医疗机构'));
  setIfPresent('页眉病历标题', '病 程 记 录');
  setIfPresent('页眉姓名', registration?.name || '');
  setIfPresent('页眉科室名称', registration?.deptName || registration?.wardName || '');
  setIfPresent('页眉床位号', registration?.bedNo || '');
  setIfPresent('页眉住院号', registration?.inpatientNo || registration?.admissionNo || '');
  setIfPresent('病程记录操作时间', formatDateMinute());
  setIfPresent('病程记录操作人员', doctorName);
  setIfPresent('病程记录操作名称文本', '日常病程记录');
  setIfPresent('病程记录文本', diagnosisText ? `患者目前入院诊断为${diagnosisText}，请结合查房情况审核补充。` : '');
  setIfPresent('医师签名', doctorName);

  fields.forEach((field) => {
    if (values[field.id] == null) {
      values[field.id] = field.defaultValue || '';
    }
  });

  return values;
}
