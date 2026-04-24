import { medicalDataService } from '../services/medicalData';
import type { GeneratedRecord } from '../types/voiceResult';

export function useVoiceCatalogMatching() {
  function matchLocalData(rec: GeneratedRecord): void {
    if (rec.diagnosisList) {
      rec.diagnosisList.forEach(diagnosis => {
        if (!diagnosis.code) {
          const match = medicalDataService.matchDiagnosis(diagnosis.name);
          if (match) {
            diagnosis.name = match.name;
            diagnosis.code = match.code;
            diagnosis.matched = true;
            diagnosis.isTCM = false;
            return;
          }

          const tcmMatch = medicalDataService.matchTCMDiagnosis(diagnosis.name);
          if (tcmMatch) {
            diagnosis.name = tcmMatch.name;
            diagnosis.code = tcmMatch.code;
            diagnosis.matched = true;
            diagnosis.isTCM = true;
          }
        } else if (diagnosis.code && /^A\d{2}\./.test(diagnosis.code)) {
          diagnosis.isTCM = true;
        }

        if (diagnosis.isTCM && diagnosis.syndrome && !diagnosis.syndromeCode) {
          const syndromeMatch = medicalDataService.matchTCMSyndrome(diagnosis.syndrome);
          if (syndromeMatch) {
            diagnosis.syndrome = syndromeMatch.name;
            diagnosis.syndromeCode = syndromeMatch.code;
            diagnosis.syndromeMatched = true;
          }
        }

        if (diagnosis.isTCM && diagnosis.treatment && !diagnosis.treatmentCode) {
          const treatmentMatch = medicalDataService.matchTCMTreatment(diagnosis.treatment);
          if (treatmentMatch) {
            diagnosis.treatment = treatmentMatch.name;
            diagnosis.treatmentCode = treatmentMatch.code;
            diagnosis.treatmentMatched = true;
          }
        }
      });
    }

    rec.medications?.forEach(medicine => {
      const match = medicalDataService.matchMedicine(medicine.name);
      if (match) {
        medicine.name = match.name;
        if (!medicine.spec) medicine.spec = match.spec;
        medicine.matched = true;
        medicine.idMedPro = match.id;
      }
    });

    rec.examinations?.forEach(examination => {
      const match = medicalDataService.matchExamItem(examination.name);
      if (match) {
        examination.name = match.name;
        examination.matched = true;
        examination.idCli = match.id;
      }
    });

    rec.labTests?.forEach(labTest => {
      const match = medicalDataService.matchLabTestItem(labTest.name);
      if (match) {
        labTest.name = match.name;
        labTest.matched = true;
        labTest.idCli = match.id;
      }
    });

    rec.procedures?.forEach(procedure => {
      const match = medicalDataService.matchProcedureItem(procedure.name);
      if (match) {
        procedure.name = match.name;
        procedure.matched = true;
      }
    });
  }

  return { matchLocalData };
}
