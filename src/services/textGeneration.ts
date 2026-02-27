/**
 * 文本生成服务
 * 处理 templates.json 中的 textGenConfig 配置，用于生成主诉和现病史文本
 */

// === 类型定义 ===

export interface TextGenConfig {
    /** 生成目标：主诉或现病史 */
    targets: ('chiefComplaint' | 'historyOfPresentIllness')[];
    /** 文本模板，使用 {value} 作为占位符 */
    template: string;
    /** 多选值分隔符，默认 "、" */
    separator?: string;
    /** 选项特定行为配置 */
    optionConfig?: {
        /** 忽略的值（不参与拼接） */
        ignoreValues?: string[];
        /** 值映射（用于简化或详化文案） */
        valueMap?: Record<string, string>;
    };
}

export interface ApplicablePopulation {
    /** 适用性别：'1'-男, '2'-女，空数组表示不限 */
    genders?: string[];
    /** 年龄范围 */
    ageRange?: {
        min?: number;
        max?: number;
        unit?: 'Y' | 'M' | 'D'; // 岁/月/天
    };
}

export interface PatientInfo {
    sdSex?: string;
    ageNum?: number;
    ageUnit?: string;
    [key: string]: any;
}

// === 核心函数 ===

/**
 * 判断字段是否适用于当前患者
 */
export function isFieldApplicable(
    field: { applicablePopulation?: ApplicablePopulation },
    patientInfo: PatientInfo
): boolean {
    const pop = field.applicablePopulation;

    // 无配置或空配置，默认适用
    if (!pop) return true;

    // 性别检查
    if (pop.genders && pop.genders.length > 0) {
        if (!pop.genders.includes(patientInfo.sdSex || '')) {
            return false;
        }
    }

    // 年龄检查
    if (pop.ageRange) {
        const patientAge = normalizeAge(patientInfo.ageNum, patientInfo.ageUnit);
        const minAge = pop.ageRange.min !== undefined
            ? normalizeAge(pop.ageRange.min, pop.ageRange.unit || 'Y')
            : 0;
        const maxAge = pop.ageRange.max !== undefined
            ? normalizeAge(pop.ageRange.max, pop.ageRange.unit || 'Y')
            : Infinity;

        if (patientAge < minAge || patientAge > maxAge) {
            return false;
        }
    }

    return true;
}

/**
 * 将年龄标准化为天数，便于比较
 */
function normalizeAge(value: number | undefined, unit?: string): number {
    if (value === undefined) return 0;
    switch (unit) {
        case 'Y': return value * 365;
        case 'M': return value * 30;
        case 'D': return value;
        default: return value * 365; // 默认按年
    }
}

/**
 * 根据 textGenConfig 生成字段文本
 * @param config 文本生成配置
 * @param value 字段值（可能是字符串、数组或对象）
 * @returns 生成的文本，如果值无效则返回 null
 */
export function generateFieldText(
    config: TextGenConfig,
    value: any,
    label?: string
): string | null {
    if (value === undefined || value === null || value === '') {
        return null;
    }

    const separator = config.separator || '、';
    const ignoreValues = config.optionConfig?.ignoreValues || [];
    const valueMap = config.optionConfig?.valueMap || {};

    let processedValues: string[] = [];

    // 处理不同类型的值
    if (Array.isArray(value)) {
        // 多选值
        processedValues = value
            .filter(v => !ignoreValues.includes(v))
            .map(v => valueMap[v] || v);
    } else if (typeof value === 'object' && value.inputValue !== undefined) {
        // input_radio 类型: { inputValue, radioValue }
        if (value.inputValue && value.radioValue) {
            const combined = `${value.inputValue}${value.radioValue}`;
            // 对于 input_radio，UI上的跳过条件往往只能选到单位（radioValue）。如果匹配上了就跳过。
            if (!ignoreValues.includes(combined) && !ignoreValues.includes(value.radioValue)) {
                processedValues = [valueMap[combined] || combined];
            }
        }
    } else if (typeof value === 'string') {
        // 单选值
        if (!ignoreValues.includes(value)) {
            processedValues = [valueMap[value] || value];
        }
    } else if (typeof value === 'number') {
        // 数值
        processedValues = [String(value)];
    }

    // 过滤后无有效值
    if (processedValues.length === 0) {
        return null;
    }

    // 拼接值
    const combinedValue = processedValues.join(separator);

    // 应用模板
    // 应用模板
    let result = config.template.replace(/{value}/g, combinedValue);
    if (label) {
        result = result.replace(/{label}/g, label);
    }

    return result;
}

/**
 * 为症状的所有字段生成文本
 * @param symptom 症状配置
 * @param formData 表单数据
 * @param target 目标类型（主诉或现病史）
 * @returns 生成的文本数组
 */
export function generateTextsForSymptom(
    symptom: any,
    formData: Record<string, any>,
    target: 'chiefComplaint' | 'historyOfPresentIllness',
    excludeKeys: string[] = []
): string[] {
    const results: string[] = [];

    if (!symptom.config?.sections) return results;

    symptom.config.sections.forEach((section: any) => {
        section.fields.forEach((field: any) => {
            const fieldKey = field.storageKey;
            if (!fieldKey || excludeKeys.includes(fieldKey)) return;

            const value = formData[fieldKey];
            if (value === undefined || value === null || value === '') return;

            // 获取明确配置，或退回到默认配置
            const explicitConfig = field.textGenConfig as TextGenConfig | undefined;
            const defaultConfig = getDefaultTextGenConfig(fieldKey, field.type, symptom.key);

            // 优先使用用户配置，如果完全没有用户配置则使用默认配置
            const textGenConfig = explicitConfig || defaultConfig;

            if (textGenConfig && textGenConfig.targets.includes(target)) {
                // 如果用户有显式配置，但只配置了现病史没配置主诉，那么主诉就不应该生成
                // 但是对于 onsetTime 等默认就有主诉的字段，如果用户没有做任何配置，则使用默认的配置参与主诉生成。
                // 这里的逻辑就是直接判断最终的 textGenConfig.targets 是否包含 target。
                const text = generateFieldText(textGenConfig, value, field.label);
                if (text) {
                    results.push(text);
                }
            }
        });
    });

    return results;
}

/**
 * 获取字段的默认文本生成配置（用于无配置时的回退逻辑）
 */
export function getDefaultTextGenConfig(
    fieldKey: string,
    _fieldType: string,
    symptomKey?: string
): TextGenConfig | null {
    // 常见字段的默认配置
    const defaults: Record<string, TextGenConfig> = {
        onsetTime: {
            targets: ['chiefComplaint'],
            template: '{value}',
        },
        precipitatingFactor: {
            targets: ['historyOfPresentIllness'],
            template: '诱因：{value}',
            optionConfig: {
                ignoreValues: ['不清楚', '没有原因', '无明显诱因'],
                valueMap: {
                    '没有原因': '无明显诱因'
                }
            }
        },
        reliefFactor: {
            targets: ['historyOfPresentIllness'],
            template: '缓解因素：{value}',
            optionConfig: {
                ignoreValues: ['不清楚', '不能']
            }
        },
        frequencyCharacteristic: {
            targets: ['historyOfPresentIllness'],
            template: '频次特点：{value}',
            optionConfig: {
                ignoreValues: ['不清楚']
            }
        },
        symptomSeverity: {
            targets: ['historyOfPresentIllness'],
            template: '程度：{value}',
            optionConfig: {
                ignoreValues: ['不清楚']
            }
        }
    };

    if (defaults[fieldKey]) {
        return defaults[fieldKey];
    }

    // 针对特定症状下的特定字段产生的定制拼接（取代旧版 formatSymptomDetail 的特异性逻辑）
    if (symptomKey === 'cough' && fieldKey === 'colorFeature') {
        return {
            targets: ['historyOfPresentIllness'],
            template: '咳{value}',
            optionConfig: { ignoreValues: ['不清楚', '无', '以上都无', '未查', '不详', '不记得'] }
        };
    }

    if (symptomKey === 'fever' && fieldKey === 'maximumBodyTemperature') {
        return {
            targets: ['historyOfPresentIllness'],
            template: '最高体温{value}℃',
            optionConfig: { ignoreValues: ['不清楚', '无', '以上都无', '未查', '不详', '不记得'] }
        };
    }

    // 通用现病史兜底：所有没有显式配置且未命名的有效字段
    return {
        targets: ['historyOfPresentIllness'],
        template: '{value}',
        optionConfig: {
            ignoreValues: ['不清楚', '无', '以上都无', '未查', '不详', '不记得']
        }
    };
}
