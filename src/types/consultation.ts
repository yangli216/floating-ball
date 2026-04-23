export interface Diagnosis {
    id?: string;
    code: string;
    name: string;
    rate: string;
    rationale: string;
    isTCM?: boolean; // 标记是否为中医诊断
    // 中医辨证论治相关字段
    syndrome?: string; // 证候(如:风寒束表证)
    syndromeCode?: string;
    syndromeMatched?: boolean;
    treatment?: string; // 治法(如:辛温解表)
    treatmentCode?: string;
    treatmentMatched?: boolean;
}

export interface Patient {
    idTet?: string;
    idPi?: string;
    idMpi?: string;
    cdPi?: string;
    naPi: string;
    sdSex: string;
    birthday?: string;
    idCard?: string;
    mobilePhone?: string;
    sdNation?: string;
    sdNaty?: string;
    sdBlood?: string;
    sdRhBlood?: string;
    sdMarital?: string;
    sdCard?: string;
    ageNum?: number;
    ageUnit?: string;
    ageText?: string;
    sdNationText?: string;
    sdNatyText?: string;
    sdMaritalText?: string;
    sdSexText?: string;
    sdBloodText?: string;
    fgActiveText?: string;
    sdRhBloodText?: string;
    sdCardText?: string;
    allergyHistory?: string;
    [key: string]: any; // Allow flexibility for extra fields
}

export interface TreatmentRecommendation {
    type: 'medicine' | 'exam' | 'lab_test' | 'procedure' | 'acupuncture';
    name: string; // AI recommended name
    originalName?: string; // AI 原始推荐名称（手动匹配后保留）
    aliases?: string[];
    reason: string;
    spec?: string;
    usage?: string;
    ingredients?: string; // TCM specific
    matchedItem?: any; // Matched item from catalog
    suggestedMatchItem?: any; // 高相似候选项，待医生确认
    matchStatus?: 'exact' | 'probable' | 'confirmed' | 'manual' | 'unmatched';
    manualMatched?: boolean;
    selected?: boolean;
    sourceType?: 'explicit' | 'inferred' | 'uncertain';
    evidenceText?: string;
    goal?: string;
    // Editable fields for PHIS import
    dosage?: string;        // 每次剂量 (medicine)
    dosageUnit?: string;    // 剂量单位 (medicine)
    totalQty?: string;      // 总量 (all types)
    totalUnit?: string;     // 总量单位
    frequency?: string;     // 频次 (medicine)
    frequencyKey?: string;  // 频次编码 (medicine)
    route?: string;         // 药品用法/给药途径 (medicine)
    routeKey?: string;      // 用法编码 (medicine)
    days?: string;          // 天数 (medicine)
    pharmacy?: string;      // 药房 (medicine)
    regulatedDisease?: string; // 规定病 (all types)
    bodySite?: string;      // 部位方式 (exam/lab_test)
    execDept?: string;      // 执行科室 (exam/lab_test/procedure)
    remark?: string;        // 备注
    insuranceType?: string; // 医保限用 (all types)
}

export interface FinalRecord {
    patient: Patient;
    record: {
        chiefComplaint: string;
        historyOfPresentIllness: string;
        tcmFourExaminations?: string;
        pastMedicalHistory?: string;
        allergyHistory?: string;
    };
    diagnosis: Diagnosis;
    treatments: TreatmentRecommendation[];
    date: string;
    treatmentPrinciple?: string; // 治则治法
    medicalAdvice?: string; // 医嘱
}
