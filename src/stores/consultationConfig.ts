import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { Patient, Diagnosis, TreatmentRecommendation, FinalRecord } from '../types/consultation';

export const useConsultationStore = defineStore('consultation', () => {
    // --- State ---

    // Patient Info (could be hydrated from props or API)
    const patientInfo = ref<Patient | null>(null);

    // UI State
    const consultationMode = ref<'western' | 'tcm'>('western');
    const selectionMode = ref<'common' | 'bodyPart' | 'system'>('common');

    // AI State
    const aiLoading = ref(false);
    const aiError = ref<string | null>(null);
    const aiDiagnoses = ref<Diagnosis[]>([]);
    const selectedDiagnosis = ref<Diagnosis | null>(null);

    const treatmentLoading = ref(false);
    const treatmentError = ref<string | null>(null);
    const treatmentRecommendations = ref<TreatmentRecommendation[]>([]);

    // Final Output State
    const finalRecord = ref<FinalRecord | null>(null);
    const generatedRecord = ref({
        chiefComplaint: '',
        historyOfPresentIllness: '',
        tcmFourExaminations: ''
    });

    // --- Actions ---

    function setPatientInfo(info: Patient) {
        patientInfo.value = info;
    }

    function clearConsultation() {
        aiDiagnoses.value = [];
        selectedDiagnosis.value = null;
        treatmentRecommendations.value = [];
        aiError.value = null;
        treatmentError.value = null;
        finalRecord.value = null;
        generatedRecord.value = {
            chiefComplaint: '',
            historyOfPresentIllness: '',
            tcmFourExaminations: ''
        };
    }

    return {
        patientInfo,
        consultationMode,
        selectionMode,
        aiLoading,
        aiError,
        aiDiagnoses,
        selectedDiagnosis,
        treatmentLoading,
        treatmentError,
        treatmentRecommendations,
        finalRecord,
        generatedRecord,
        setPatientInfo,
        clearConsultation
    };
});
