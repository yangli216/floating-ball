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
    reason: string;
    usage?: string;
    ingredients?: string; // TCM specific
    matchedItem?: any; // Matched item from catalog
    selected?: boolean;
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
