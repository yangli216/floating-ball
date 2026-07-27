import { describe, expect, it } from 'vitest';
import type {
  ChronicDiseasePatientSummary,
  ChronicDiseaseType,
} from '../types';
import {
  buildFusedFollowUpRequest,
  createFusedFollowUpFormState,
  emptyDrugItem,
  hasDiabetes,
  hasHypertension,
  toggleArteriopalmusCode,
  toggleExclusiveCode,
  toggleSymptomCode,
  validateFusedFollowUpForm,
} from './followUpFormModel';

function summary(diseaseTypes: ChronicDiseaseType[]): ChronicDiseasePatientSummary {
  return {
    idPhr: 'PHR001',
    idRecord: 'RECORD001',
    name: '林女士',
    gender: '女',
    ageText: '62岁',
    avatarGender: 'F',
    organizationId: 'ORG001',
    organizationName: '浦口区示范机构',
    doctorId: 'D001',
    doctorName: '沈医生',
    contractLabel: '已签约',
    contractSource: 'public-health',
    diseaseTags: diseaseTypes.map((diseaseType) => ({
      diseaseType,
      label: diseaseType === 'hypertension' ? '高血压' : '2 型糖尿病',
      source: 'public-health',
      sourceLabel: '公卫管理',
      evidenceText: diseaseType === 'hypertension' ? '3' : '6',
    })),
    managedDiseaseTypes: diseaseTypes,
    hasSupportedDisease: true,
    isChronicManaged: true,
    diagnosisText: '高血压、2 型糖尿病',
    lastVisitLabel: '2026-07-20',
    bloodPressurePoints: [{
      measuredAt: '2026-07-20T09:00:00+08:00',
      systolic: 138,
      diastolic: 86,
      sourceLabel: '门诊',
    }],
    bloodGlucosePoints: [{
      measuredAt: '2026-07-20T09:05:00+08:00',
      value: 7.2,
      measurementType: 'fasting',
      sourceLabel: '检验',
    }],
    recentMedicationFacts: [],
    recentMedicationNames: ['氨氯地平', '二甲双胍'],
    sourceQuality: 'ready',
  };
}

function validForm(diseaseTypes: ChronicDiseaseType[]) {
  const form = createFusedFollowUpFormState(summary(diseaseTypes));
  Object.assign(form, {
    stature: '160',
    avoirdupois: '64',
    advAdp: '60',
    waistline: '88',
    advWaistline: '84',
    pressureH: '138',
    pressureL: '86',
    heartRate: '72',
    glu: '7.2',
    sdPsychicAdj: '1',
    sdWehtherSmoke: '0',
    sdWhetherDrink: '0',
    sportWeek: '4',
    advSportWeek: '5',
    sportMinute: '30',
    advSportMinute: '30',
    fgDrugChange: '0',
    sdDrugPro: '1',
    sdSideEffects: '1',
  });
  if (diseaseTypes.includes('hypertension')) {
    form.sdHySymptom = ['1'];
    form.sdSalt = '6';
    form.sdAdvSalt = '5';
  }
  if (diseaseTypes.includes('type2_diabetes')) {
    form.sdDbsSymptom = ['1'];
    form.rice = '300';
    form.targRice = '250';
  }
  return form;
}

describe('TcdVisitForm fused follow-up model', () => {
  it.each([
    [['hypertension'], ['1'], true, false],
    [['type2_diabetes'], ['2'], false, true],
    [['hypertension', 'type2_diabetes'], ['1', '2'], true, true],
  ] as const)(
    'derives read-only sdVisitKind from the public-health disease marker',
    (diseaseTypes, expected, hypertension, diabetes) => {
      const form = createFusedFollowUpFormState(summary([...diseaseTypes]));

      expect(form.sdVisitKind).toEqual(expected);
      expect(hasHypertension(form)).toBe(hypertension);
      expect(hasDiabetes(form)).toBe(diabetes);
    },
  );

  it('validates the union of hypertension and diabetes fields for a combined visit', () => {
    const form = validForm(['hypertension', 'type2_diabetes']);
    form.sdDbsSymptom = [];

    expect(validateFusedFollowUpForm({ form })).toEqual({
      message: '请输入糖尿病症状',
      sectionIndex: 2,
    });

    form.sdDbsSymptom = ['1'];
    expect(validateFusedFollowUpForm({ form })).toBeNull();
  });

  it('rejects save before HIS invocation when the query response has no idRecord', () => {
    const form = validForm(['hypertension']);
    form.idRecord = ' ';

    expect(validateFusedFollowUpForm({ form })).toEqual({
      message: '缺少登记表主键',
      sectionIndex: 0,
    });
  });

  it('serializes one exact legacy request and joins the original array fields', () => {
    const form = validForm(['hypertension', 'type2_diabetes']);
    form.sdHySymptom = ['2', '6'];
    form.sdDbsSymptom = ['7'];
    form.sdArteriopalmus = ['4', '5'];
    form.sdMajorCc = ['0'];
    form.targetOrganDamage = ['1', '3'];
    form.sdComplications = ['1', '0'];
    form.desComplications = '其他并发症';
    form.sdComorbidity = ['2'];
    form.fgDrugChange = '1';
    form.drugList = [
      { ...emptyDrugItem(), naDrug: '无 ID 历史药品' },
      {
        ...emptyDrugItem(),
        idDrug: 'MED001',
        naDrug: '二甲双胍',
        sdDrugFreq: '2',
        perDose: '0.5',
        doseUnit: 'g',
        insulin: '2',
      },
    ];

    const request = buildFusedFollowUpRequest(form);

    expect(request).toEqual(expect.objectContaining({
      idPhr: 'PHR001',
      idRecord: 'RECORD001',
      status: '3',
      sdVisitKind: '1,2',
      pressureH: '138',
      pressureL: '86',
      glu: '7.2',
      fbgMeal: '',
      sdHySymptom: '2,6',
      sdDbsSymptom: '7',
      sdArteriopalmus: '4,5',
      sdMajorCc: '0',
      targetOrganDamage: '1,3',
      sdComplications: '1,0',
      sdComorbidity: '2',
      bmi: '25.00',
      advBmi: '23.44',
    }));
    expect(request).not.toHaveProperty('requestId');
    expect(request).not.toHaveProperty('managementSource');
    expect(request).not.toHaveProperty('templateVersion');
    expect(Object.keys(request).sort()).toEqual([
      'advAdp',
      'advBmi',
      'advDayDrink',
      'advDaySmoke',
      'advSportMinute',
      'advSportWeek',
      'advWaistline',
      'avoirdupois',
      'bmi',
      'dayDrink',
      'daySmoke',
      'desAdr',
      'desComor',
      'desComorbidity',
      'desComplications',
      'desNoRef',
      'desOther',
      'desPresAdvice',
      'desRef',
      'desSideEffects',
      'drugList',
      'dtDbsPlan',
      'dtHyPlan',
      'fbgMeal',
      'fgCardiovascular',
      'fgDrugChange',
      'fgRef',
      'glu',
      'heartRate',
      'id',
      'idPhr',
      'idRecord',
      'idUser',
      'inputUser',
      'isGlu',
      'lowEffects',
      'note',
      'otherDisease',
      'pressureH',
      'pressureL',
      'refDep',
      'rice',
      'sdAdvSalt',
      'sdArteriopalmus',
      'sdComorbidity',
      'sdComplications',
      'sdDataWay',
      'sdDbsSymptom',
      'sdDrugPro',
      'sdHySymptom',
      'sdMainDrinking',
      'sdMajorCc',
      'sdProAct',
      'sdPsychicAdj',
      'sdRefStatus',
      'sdSalt',
      'sdSideEffects',
      'sdVisitKind',
      'sdWehtherSmoke',
      'sdWhetherDrink',
      'sportMinute',
      'sportWeek',
      'stature',
      'status',
      'targRice',
      'targetOrganDamage',
      'waistline',
    ]);
    expect(request.drugList).toHaveLength(1);
    expect(request.drugList[0].idDrug).toBe('MED001');
  });

  it('clears disease-inapplicable and disabled values while keeping legacy field names', () => {
    const form = validForm(['hypertension']);
    form.glu = '9.9';
    form.rice = '300';
    form.sdWehtherSmoke = '2';
    form.daySmoke = '10';
    form.sdWhetherDrink = '4';
    form.dayDrink = '2';

    const request = buildFusedFollowUpRequest(form);

    expect(request.sdVisitKind).toBe('1');
    expect(request.glu).toBe('');
    expect(request.rice).toBe('');
    expect(request.daySmoke).toBe('');
    expect(request.dayDrink).toBe('');
  });

  it('preserves the original mutually-exclusive checkbox behavior', () => {
    expect(toggleSymptomCode([], '1')).toEqual(['1']);
    expect(toggleSymptomCode(['1'], '6')).toEqual(['6']);
    expect(toggleExclusiveCode(['0'], '2', '0')).toEqual(['2']);
    expect(toggleArteriopalmusCode(['4'], '5')).toEqual(['4', '5']);
    expect(toggleArteriopalmusCode(['4', '5'], '2')).toEqual(['2']);
  });
});
