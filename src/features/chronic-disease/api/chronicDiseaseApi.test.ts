import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getHisAdapter } from '@/services/his';
import type { TcdVisitForm } from '../types';
import { saveTcdForm } from './chronicDiseaseApi';

vi.mock('@/services/his', () => ({
  getHisAdapter: vi.fn(),
}));
vi.mock('@/services/regionalClient', () => ({
  regionalPost: vi.fn(),
}));

function formFixture(): TcdVisitForm {
  return {
    idPhr: 'PHR001',
    idRecord: 'RECORD001',
    id: '',
    status: '3',
    sdVisitKind: '1,2',
    dtHyPlan: '',
    dtDbsPlan: '',
    sdDataWay: '',
    stature: '176',
    avoirdupois: '76',
    advAdp: '74',
    bmi: '24.54',
    advBmi: '23.89',
    waistline: '55',
    advWaistline: '55',
    pressureH: '120',
    pressureL: '90',
    heartRate: '43',
    glu: '5',
    fbgMeal: '',
    isGlu: '1',
    inputUser: 'USER001',
    idUser: 'USER001',
    sdHySymptom: '2,3',
    sdDbsSymptom: '2,3',
    desOther: '',
    sdArteriopalmus: '0',
    sdProAct: '1',
    sdPsychicAdj: '1',
    fgCardiovascular: '1',
    lowEffects: '0',
    otherDisease: '',
    note: '',
    sdWehtherSmoke: '1',
    daySmoke: '1',
    advDaySmoke: '1',
    sdWhetherDrink: '1',
    dayDrink: '1',
    advDayDrink: '1',
    sdMainDrinking: '3',
    sportWeek: '3',
    advSportWeek: '3',
    sportMinute: '30',
    advSportMinute: '30',
    sdSalt: '3',
    sdAdvSalt: '3',
    rice: '3',
    targRice: '3',
    fgDrugChange: '0',
    sdDrugPro: '1',
    sdSideEffects: '1',
    desSideEffects: '',
    drugList: [],
    fgRef: '1',
    sdRefStatus: '1',
    desRef: '',
    refDep: '',
    desNoRef: '',
    desAdr: '',
    sdComplications: '',
    desComplications: '',
    desComor: '',
    sdComorbidity: '',
    desComorbidity: '',
    sdMajorCc: '',
    targetOrganDamage: '',
    desPresAdvice: '',
  };
}

describe('saveTcdForm', () => {
  beforeEach(() => {
    vi.mocked(getHisAdapter).mockReset();
  });

  it('passes the exact form object to the active HIS adapter', async () => {
    const form = formFixture();
    const response = { id: 'FOLLOW-UP-001' };
    const adapter = {
      saveTcdForm: vi.fn().mockResolvedValue(response),
    };
    vi.mocked(getHisAdapter).mockReturnValue(
      adapter as unknown as NonNullable<ReturnType<typeof getHisAdapter>>,
    );

    await expect(saveTcdForm(form)).resolves.toBe(response);
    expect(adapter.saveTcdForm).toHaveBeenCalledWith(form);
  });

  it('rejects before saving when the HIS adapter is unavailable', async () => {
    vi.mocked(getHisAdapter).mockReturnValue(null);

    await expect(saveTcdForm(formFixture()))
      .rejects.toThrow('HIS 尚未初始化，无法保存两慢病随访');
  });
});
