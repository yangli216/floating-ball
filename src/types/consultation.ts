export interface Diagnosis {
    id?: string;
    code: string;
    name: string;
    rate: string;
    rationale: string;
    /** 正式诊断建议或仅供补充信息后判断的待鉴别方向。 */
    suggestionType?: 'formal' | 'differential';
    /** 待鉴别方向仍需补充的问诊、查体或检查信息。 */
    missingInformation?: string;
    isTCM?: boolean; // 标记是否为中医诊断
    originalName?: string; // AI 原始推荐的诊断名称
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

export interface RecentPrescriptionHistoryEntry {
    visitId?: string;
    prescribedAt: number;
    deptName?: string;
    orderId?: string;
    productId?: string;
    name: string;
    spec?: string;
    dosage?: string;
    dosageUnit?: string;
    frequency?: string;
    route?: string;
    days?: string;
    totalQty?: string;
    totalUnit?: string;
}

export interface RecentPrescriptionHistory {
    lookbackDays: number;
    matchedName: string;
    matchedProductId?: string;
    matchBasis: 'product-id' | 'exact-name' | 'ambiguous-name' | 'none';
    entries: RecentPrescriptionHistoryEntry[];
}

export type ChronicRefillReviewConfidence = 'high' | 'medium' | 'low';
export type ChronicRefillReviewEvidence =
    | 'current-explicit'
    | 'historical-consistent'
    | 'model-inference'
    | 'unknown';

export interface ChronicRefillReviewOption {
    value: string;
    label: string;
    /** 医生点击确认后才允许进入现病史。 */
    recordText: string;
    /** 当前选择意味着续方方案需要医生重新核查。 */
    treatmentReviewRequired?: boolean;
}

export interface ChronicRefillReviewItem {
    id: string;
    question: string;
    description: string;
    options: ChronicRefillReviewOption[];
    recommendedValue: string;
    confidence: ChronicRefillReviewConfidence;
    evidence: ChronicRefillReviewEvidence;
    basis: string;
    priority: 'critical' | 'general';
}

export interface ChronicRefillReviewPlan {
    summary: string;
    items: ChronicRefillReviewItem[];
}

export interface TreatmentRecommendation {
    type: 'medicine' | 'exam' | 'lab_test' | 'procedure' | 'acupuncture';
    name: string; // AI recommended name
    originalName?: string; // AI 原始推荐名称（手动匹配后保留）
    aliases?: string[];
    reason: string;
    spec?: string;
    targetDose?: string;      // AI 目标治疗剂量数值 (如 "500")
    targetDoseUnit?: string;  // AI 剂量单位 (如 "mg")
    usage?: string;
    ingredients?: string; // TCM specific
    matchedItem?: any; // Matched item from catalog
    suggestedMatchItem?: any; // 高相似候选项，待医生确认
    matchStatus?: 'exact' | 'probable' | 'confirmed' | 'manual' | 'unmatched';
    manualMatched?: boolean;
    selected?: boolean;
    rejected?: boolean; // 医生明确不采用该推荐；不等同于暂未勾选
    sourceType?: 'explicit' | 'inferred' | 'uncertain';
    evidenceText?: string;
    goal?: string;
    // Editable fields for PHIS import
    dosage?: string;        // 每次剂量 (medicine)
    dosageUnit?: string;    // 剂量单位 (medicine)
    dosageManualEdited?: boolean; // 医生已手动修改一次剂量，后续 hydrate 不得覆盖
    totalQty?: string;      // 总量 (all types)
    totalUnit?: string;     // 总量单位
    totalManualEdited?: boolean; // 总量是否已被医生手动修改
    frequency?: string;     // 频次 (medicine)
    frequencyKey?: string;  // 频次编码 (medicine)
    route?: string;         // 药品用法/给药途径 (medicine)
    routeKey?: string;      // 用法编码 (medicine)
    days?: string;          // 天数 (medicine)
    pharmacy?: string;      // 药房 (medicine)
    pharmacyCleared?: boolean; // 医生已手动清空药房，禁止自动选默认药房
    regulatedDisease?: string; // 规定病 (all types)
    bodySite?: string;      // 部位方式 (exam)
    bodySiteId?: string;    // 部位方式 ID，PHIS 回写 idPart
    bodySiteOptions?: Array<{
        partId: string;
        name: string;
        partAndWay?: string;
        partAndWayCode?: string;
        raw: Record<string, unknown>;
    }>; // 检查项目部位候选
    execDept?: string;      // 执行科室 (exam/lab_test/procedure)
    execDeptCleared?: boolean; // 医生已手动清空执行科室，禁止用匹配元数据自动补回
    remark?: string;        // 备注
    insuranceType?: string; // 医保限用 (all types)
    insuranceCleared?: boolean; // 医生已手动清空医保限用，禁止用默认医保类型自动补回
    /** 慢病配药场景的近期开药核查证据；仅用于医生复核，不代表医保规则判定。 */
    recentPrescriptionHistory?: RecentPrescriptionHistory;
}

export interface FinalRecord {
    patient: Patient;
    record: {
        chiefComplaint: string;
        historyOfPresentIllness: string;
        tcmFourExaminations?: string;
        pastMedicalHistory?: string;
        allergyHistory?: string;
        familyHistory?: string;
    };
    diagnosis: Diagnosis;
    treatments: TreatmentRecommendation[];
    date: string;
    treatmentPrinciple?: string; // 治则治法
    medicalAdvice?: string; // 医嘱
}
