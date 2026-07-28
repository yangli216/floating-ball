import { describe, expect, it } from 'vitest';
import { MockHisAdapter } from './MockHisAdapter';

describe('MockHisAdapter chronic workflow support', () => {
  it('returns a distinct clinical item ID instead of copying the service ID', async () => {
    const [loaded] = await new MockHisAdapter().loadVisCliList([{
      idSrv: 'SRV001',
      naSrv: '血常规',
      itemKind: '1',
    }]);

    expect(loaded).toEqual(expect.objectContaining({
      idSrv: 'SRV001',
      idCli: 'mock-cli-SRV001',
      naSrv: '血常规',
    }));
    expect(loaded.idCli).not.toBe(loaded.idSrv);
  });

  it('provides standard diagnoses for both supported chronic diseases', async () => {
    const diagnoses = await new MockHisAdapter().fetchDiagnosisCatalog();

    expect(diagnoses).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'I10.x00', name: '原发性高血压' }),
      expect.objectContaining({ code: 'E11.900', name: '2型糖尿病' }),
    ]));
  });
});
