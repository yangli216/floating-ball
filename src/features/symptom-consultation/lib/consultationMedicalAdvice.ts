export type ConsultationMedicalAdviceMode = 'western' | 'tcm';

export interface BuildMedicalAdviceInput {
  mode: ConsultationMedicalAdviceMode;
  hasHerbalMedicine?: boolean;
}

export function buildMedicalAdvice(input: BuildMedicalAdviceInput): string {
  const advice: string[] = [];

  if (input.mode === 'tcm') {
    advice.push('1. 按时服药，遵医嘱用药。');
    advice.push('2. 注意休息，避风寒，保持心情舒畅。');
    advice.push('3. 饮食宜清淡，忌辛辣刺激、生冷油腻之品。');
    advice.push('4. 如症状加重或出现新的不适，请及时复诊。');

    if (input.hasHerbalMedicine) {
      advice.push('5. 中药煎服法：先煎20分钟，文火煎煮30分钟，每日1剂，分早晚两次温服。');
    }
  } else {
    advice.push('1. 按时服药，注意观察药物不良反应。');
    advice.push('2. 多饮水，清淡饮食，注意休息。');
    advice.push('3. 如症状无缓解或加重，请及时复诊。');
  }

  return advice.join('\n');
}
