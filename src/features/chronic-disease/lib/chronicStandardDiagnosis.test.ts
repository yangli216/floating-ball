import { describe, expect, it } from 'vitest';
import type { ChronicDiseaseTag } from '../types';
import { resolveChronicStandardDiagnoses } from './chronicStandardDiagnosis';

function buildTag(
  diseaseType: ChronicDiseaseTag['diseaseType'],
  source: ChronicDiseaseTag['source'],
): ChronicDiseaseTag {
  return {
    diseaseType,
    label: diseaseType === 'hypertension' ? '高血压' : '2 型糖尿病',
    source,
    sourceLabel: source === 'public-health' ? '公卫管理' : '临床识别',
  };
}

describe('resolveChronicStandardDiagnoses', () => {
  it('uses diseaseTags order, includes clinical tags, and deduplicates disease types', () => {
    const diagnoses = resolveChronicStandardDiagnoses(
      [
        buildTag('type2_diabetes', 'clinical'),
        buildTag('hypertension', 'public-health'),
        buildTag('type2_diabetes', 'public-health'),
      ],
      [
        { id: 'HTN-GENERIC', code: 'I10.9', name: '高血压' },
        { id: 'DM2-GENERIC', code: 'E11.9', name: '糖尿病' },
        { id: 'DM2-INSTITUTION', code: 'e11.900', name: '2 型糖尿病' },
        { id: 'HTN-INSTITUTION', code: 'I10.x09', name: '原发性高血压' },
      ],
    );

    expect(diagnoses).toEqual([
      {
        id: 'DM2-INSTITUTION',
        code: 'e11.900',
        name: '2 型糖尿病',
      },
      {
        id: 'HTN-INSTITUTION',
        code: 'I10.x09',
        name: '原发性高血压',
      },
    ]);
  });

  it('requires both the disease name semantics and the expected ICD family', () => {
    expect(() => resolveChronicStandardDiagnoses(
      [buildTag('type2_diabetes', 'clinical')],
      [
        { id: 'WRONG-NAME', code: 'E11.900', name: '代谢性疾病' },
        { id: 'WRONG-CODE', code: 'E10.900', name: '2型糖尿病' },
      ],
    )).toThrow(
      'HIS 标准诊断目录缺少2 型糖尿病（名称语义 + E11 编码族），无法进入诊疗方案',
    );
  });

  it('accepts a generic diabetes name when the E11 family identifies type 2', () => {
    expect(resolveChronicStandardDiagnoses(
      [buildTag('type2_diabetes', 'clinical')],
      [
        { id: 'DM2-COMPLICATION', code: 'E11.3', name: '2型糖尿病性眼病' },
        { id: 'DM2-GENERIC', code: 'E11.9', name: '糖尿病' },
      ],
    )).toEqual([{
      id: 'DM2-GENERIC',
      code: 'E11.9',
      name: '糖尿病',
    }]);
  });

  it('fails the whole resolution when any requested chronic diagnosis is missing', () => {
    expect(() => resolveChronicStandardDiagnoses(
      [
        buildTag('hypertension', 'public-health'),
        buildTag('type2_diabetes', 'clinical'),
      ],
      [{ id: 'HTN-INSTITUTION', code: 'I10', name: '原发性高血压' }],
    )).toThrow('HIS 标准诊断目录缺少2 型糖尿病');
  });

  it('rejects a draft without a supported disease tag', () => {
    expect(() => resolveChronicStandardDiagnoses([], []))
      .toThrow('本次慢病摘要缺少受支持的疾病标签');
  });
});
