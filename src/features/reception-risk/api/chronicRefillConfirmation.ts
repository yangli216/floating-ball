import { chatFast } from '@/services/llm';
import type { AppPatient } from '@/types/appState';
import {
  getPatientContextAgeText,
  getPatientContextGenderText,
} from '@/utils/patientContext';
import { parseLLMJson } from '@features/clinical-result';
import {
  getChronicRefillNarrativeMedicationNames,
  normalizeChronicRefillConfirmationPlan,
  type ChronicRefillConfirmationPlan,
  type RawChronicRefillConfirmationPlan,
} from '../lib/chronicRefillConfirmation';
import type { ChronicRefillCandidate } from '../lib/chronicRefillAssessment';

function buildHistoryEvidence(candidate: ChronicRefillCandidate): string {
  return candidate.chronicVisits.map((visit, index) => {
    const date = new Date(visit.visitTime);
    const dateText = Number.isNaN(date.getTime()) ? '日期未知' : date.toISOString().slice(0, 10);
    const narrativeMedications = getChronicRefillNarrativeMedicationNames({
      ...candidate,
      medications: visit.medications || [],
    });
    return [
      `记录${index + 1}（${dateText}）`,
      `诊断：${(visit.diagnoses || []).join('、') || '未记录'}`,
      `用药：${narrativeMedications.join('、') || '未记录'}`,
      `主诉：${visit.chiefComplaint || '未记录'}`,
      `现病史：${visit.presentIllness || '未记录'}`,
    ].join('；');
  }).join('\n');
}

export async function generateChronicRefillConfirmationPlan(
  patient: AppPatient,
  candidate: ChronicRefillCandidate,
): Promise<ChronicRefillConfirmationPlan> {
  try {
    const response = await chatFast([
      {
        role: 'system',
        content: [
          '你是基层门诊慢病复诊配药的确认计划助手。',
          '慢病范围已由医生确认；只能围绕“历史临床诊断”中的已选慢病提问，不得扩展到患者其他慢病。',
          '不要直接写完整病历；根据当前上下文动态生成最少且必要的3到5个单选确认项，减少医生操作。',
          '问题应覆盖真正影响本次现病史和续方安全的信息，例如当前实际用药、依从性、控制或监测情况、疾病相关不适、药物不良反应；具体问法和选项必须由当前疾病与上下文决定，不使用固定病种模板。',
          '每项提供2到4个互斥选项、recommendedValue、confidence、evidence和basis。',
          'evidence只能是current-explicit、historical-consistent、model-inference、unknown；confidence只能是high、medium、low。',
          '历史处方可以支持“近期可能仍按原方案”的中等置信推荐，但不能证明规律服药、控制平稳或无不适。',
          '只有当前病历明确表达时，才能高置信推荐“控制平稳、规律服药、无相关不适”等当前事实；缺乏证据时必须提供并推荐“暂未确认/暂未评估/未询问”类选项。',
          '每个选项提供recordText：医生确认后可直接进入现病史的简短事实片段；未知选项recordText必须为空。recordText不要以“患者”开头，不写年龄、性别、历史日期、库存、推荐方案、待医生核实或治疗建议。',
          '只返回JSON对象，格式为：{"summary":"确认提示","items":[{"id":"stable-id","question":"问题","description":"简短说明","options":[{"value":"值","label":"选项","recordText":"确认后的病历事实片段"}],"recommendedValue":"值","confidence":"high|medium|low","evidence":"current-explicit|historical-consistent|model-inference|unknown","basis":"推荐依据"}]}。',
        ].join('\n'),
      },
      {
        role: 'user',
        content: [
          `患者基本条件：${getPatientContextGenderText(patient)}，${getPatientContextAgeText(patient)}（仅用于决定问题，不得写进recordText）`,
          `医生已确认的本次慢病：${candidate.diagnoses.join('、')}`,
          `历史用药：${getChronicRefillNarrativeMedicationNames(candidate).join('、') || '未取得'}`,
          '最近慢病就诊证据：',
          buildHistoryEvidence(candidate) || '无可用病历正文',
        ].join('\n'),
      },
    ], undefined, undefined, undefined, {
      configProfile: 'fast',
      traceContext: {
        scene: 'reception-chronic-refill-confirmation',
        sourceModule: 'reception_risk',
        operationModule: 'reception',
        operationAction: 'generate_chronic_refill_confirmation',
        title: '生成复诊配药确认项',
      },
    });
    return normalizeChronicRefillConfirmationPlan(
      parseLLMJson<RawChronicRefillConfirmationPlan>(response),
      candidate,
    );
  } catch (error) {
    console.warn('[ChronicRefill] Confirmation plan failed, using generic fallback', error);
    return normalizeChronicRefillConfirmationPlan(null, candidate);
  }
}
