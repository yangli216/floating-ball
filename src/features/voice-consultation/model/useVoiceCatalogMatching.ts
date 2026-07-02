import { medicalDataService } from '@/services/medicalData';
import type { ExamEntry, GeneratedRecord } from '@/types/voiceResult';

// 组合项分隔符：覆盖 “A+B / A、B / A和B / A及B / A与B / A/B / A,B” 等常见组合表述
// 防御 LLM 偶尔忽略 prompt 的“细粒度拆分规则”导致检验/检查/处置项被合并、无法命中标准目录的情况
const COMBO_SEPARATOR_RE = /[+＋、,，/／]|和|及|与/;

function splitCombinedExamName(name: string): string[] {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return [];
  if (!COMBO_SEPARATOR_RE.test(trimmed)) return [trimmed];
  // 优先尝试整体命中标准目录；若已能匹配，保留原名不拆分，避免误伤“肝肾功能”等本身就是单项的命名
  if (
    medicalDataService.matchExamItem(trimmed) ||
    medicalDataService.matchLabTestItem(trimmed) ||
    medicalDataService.matchProcedureItem(trimmed)
  ) {
    return [trimmed];
  }
  const parts = trimmed
    .split(/[+＋、,，/／]|和|及|与/g)
    .map(s => s.trim())
    .filter(s => s.length >= 2);
  return parts.length > 1 ? parts : [trimmed];
}

function expandCombinedExamEntries(entries: ExamEntry[] | undefined): ExamEntry[] | undefined {
  if (!entries || entries.length === 0) return entries;
  const expanded: ExamEntry[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const parts = splitCombinedExamName(entry.name);
    if (parts.length <= 1) {
      const key = (entry.name ?? '').trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      expanded.push(entry);
      continue;
    }
    for (const partName of parts) {
      if (seen.has(partName)) continue;
      seen.add(partName);
      // 拆分后保留 goal 等共用字段，但清掉与原始名绑定的命中信息，交给后续匹配阶段重新计算
      expanded.push({ ...entry, name: partName, matched: false, idCli: undefined });
    }
  }
  return expanded;
}

export function useVoiceCatalogMatching() {
  function matchLocalData(rec: GeneratedRecord): void {
    rec.examinations = expandCombinedExamEntries(rec.examinations) ?? rec.examinations;
    rec.labTests = expandCombinedExamEntries(rec.labTests) ?? rec.labTests;
    rec.procedures = expandCombinedExamEntries(rec.procedures) ?? rec.procedures;

    if (rec.diagnosisList) {
      rec.diagnosisList.forEach(diagnosis => {
        if (!diagnosis.code) {
          const match = medicalDataService.matchDiagnosis(diagnosis.name);
          if (match) {
            diagnosis.originalName = diagnosis.name;
            diagnosis.name = match.name;
            diagnosis.code = match.code;
            diagnosis.matched = true;
            diagnosis.isTCM = false;
            return;
          }

          const tcmMatch = medicalDataService.matchTCMDiagnosis(diagnosis.name);
          if (tcmMatch) {
            diagnosis.originalName = diagnosis.name;
            diagnosis.name = tcmMatch.name;
            diagnosis.code = tcmMatch.code;
            diagnosis.matched = true;
            diagnosis.isTCM = true;
          }
        } else {
          if (/^A\d{2}\./.test(diagnosis.code)) {
            diagnosis.isTCM = true;
          } else {
            const matchContext = { icdCode: diagnosis.code };
            const nameMatch = medicalDataService.matchDiagnosis(diagnosis.name, matchContext);
            if (nameMatch && nameMatch.code !== diagnosis.code) {
              diagnosis.originalName = diagnosis.name;
              diagnosis.name = nameMatch.name;
              diagnosis.code = nameMatch.code;
              diagnosis.matched = true;
              diagnosis.isTCM = false;
            }
          }
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
