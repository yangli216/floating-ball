import { describe, expect, it } from 'vitest';
import appSource from '@/App.vue?raw';
import capsuleSource from '../ui/ReceptionCapsule.vue?raw';
import riskPanelSource from '../../reception-risk/ui/RiskAlertPanel.vue?raw';
import riskBubbleSource from '../../reception-risk/ui/RiskAlertBubble.vue?raw';
import sessionSource from './useReceptionSessionController.ts?raw';

describe('reception patient age presentation', () => {
  it('passes the complete age text through every reception surface', () => {
    expect(sessionSource).toContain('patientAgeText');
    expect(sessionSource).not.toContain('Number.parseInt(getPatientContextAgeText');
    expect(appSource).toContain(':age-text="riskPatientAgeText"');

    for (const source of [capsuleSource, riskPanelSource, riskBubbleSource]) {
      expect(source).toContain('ageText: string');
      expect(source).not.toContain('{{ age }}岁');
    }
  });

  it('uses the same age text when selecting the reception avatar', () => {
    expect(capsuleSource).toContain('resolvePatientAvatar({ gender: props.gender, ageText: props.ageText })');
    expect(riskPanelSource).toContain('resolvePatientAvatar({ gender: props.gender, ageText: props.ageText })');
  });
});
