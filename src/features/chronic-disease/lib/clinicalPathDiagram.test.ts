import { describe, expect, it } from 'vitest';
import {
  getClinicalPathDiagram,
  getClinicalPathHotspotStyle,
} from './clinicalPathDiagram';

describe('clinicalPathDiagram', () => {
  it('uses the migrated legacy diagrams for both supported diseases', () => {
    const hypertension = getClinicalPathDiagram('hypertension');
    const diabetes = getClinicalPathDiagram('type2_diabetes');

    expect(hypertension.backgroundUrl).toBe('/assets/chronic-disease/clinical-paths/hypertension/bg.png');
    expect(hypertension).toMatchObject({ naturalWidth: 1019, naturalHeight: 737 });
    expect(hypertension.hotspots.map((item) => item.id)).toEqual([
      'no-comorbidities',
      'comorbidities-table',
      'comorbidities-target',
      'lifestyle',
      'lipid-target',
    ]);
    expect(diabetes).toMatchObject({
      backgroundUrl: '/assets/chronic-disease/clinical-paths/type2-diabetes/bg.png',
      naturalWidth: 1188,
      naturalHeight: 888,
      hotspots: [],
    });
  });

  it('maps the legacy pixel hotspot onto the responsive diagram', () => {
    const diagram = getClinicalPathDiagram('hypertension');
    const hotspot = diagram.hotspots[0];

    expect(getClinicalPathHotspotStyle(diagram, hotspot)).toEqual({
      left: '3.7046%',
      top: '32.4543%',
      width: '21.3613%',
      height: '59.0486%',
    });
  });

  it('keeps the original read-only explanation content on interactive hotspots', () => {
    const diagram = getClinicalPathDiagram('hypertension');
    const medicationFlow = diagram.hotspots.find((item) => item.id === 'no-comorbidities');
    const lipidTarget = diagram.hotspots.find((item) => item.id === 'lipid-target');

    expect(medicationFlow?.drawer.kind).toBe('text');
    expect(medicationFlow?.drawer.source).toContain('国家基层高血压防治管理手册');
    expect(lipidTarget?.drawer.kind).toBe('table');
    if (lipidTarget?.drawer.kind === 'table') {
      expect(lipidTarget.drawer.rowSpanField).toBe('ldl');
      expect(lipidTarget.drawer.rows).toHaveLength(10);
    }
  });
});
