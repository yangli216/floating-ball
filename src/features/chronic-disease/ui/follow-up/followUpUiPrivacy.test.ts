import { describe, expect, it } from 'vitest';
import followUpFormSource from '../FollowUpForm.vue?raw';
import basicSectionSource from './FollowUpBasicSection.vue?raw';
import conclusionSectionSource from './FollowUpConclusionSection.vue?raw';
import lifestyleSectionSource from './FollowUpLifestyleSection.vue?raw';
import measurementsSectionSource from './FollowUpMeasurementsSection.vue?raw';
import medicationSectionSource from './FollowUpMedicationSection.vue?raw';
import referralSectionSource from './FollowUpReferralSection.vue?raw';
import symptomsSectionSource from './FollowUpSymptomsSection.vue?raw';
import typeIndicatorSource from './FollowUpTypeIndicator.vue?raw';

const followUpUiSources = {
  FollowUpForm: followUpFormSource,
  FollowUpBasicSection: basicSectionSource,
  FollowUpConclusionSection: conclusionSectionSource,
  FollowUpLifestyleSection: lifestyleSectionSource,
  FollowUpMeasurementsSection: measurementsSectionSource,
  FollowUpMedicationSection: medicationSectionSource,
  FollowUpReferralSection: referralSectionSource,
  FollowUpSymptomsSection: symptomsSectionSource,
  FollowUpTypeIndicator: typeIndicatorSource,
};

describe('chronic follow-up UI privacy boundary', () => {
  it.each(Object.entries(followUpUiSources))(
    'does not expose internal dictionary metadata in %s',
    (_name, source) => {
      expect(source).not.toMatch(/chis\.(?:dictionary|tcd)\./);
      expect(source).not.toContain('原系统字典值');
      expect(source).not.toContain('字典 ID');
      expect(source).not.toContain('字典标识');
    },
  );

  it('does not expose system-managed identifiers as doctor-editable fields', () => {
    expect(basicSectionSource).not.toMatch(/人员主键|登记表主键|医生标识/);
    expect(basicSectionSource).not.toMatch(
      /v-model(?:\.trim)?="form\.(?:idPhr|idRecord|inputUser|idUser)"/,
    );
    expect(medicationSectionSource).not.toContain('药品标识');
    expect(medicationSectionSource).not.toMatch(/v-model="drug\.idDrug"/);
  });
});
