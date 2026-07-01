import { describe, expect, it } from 'vitest';
import {
  clearFeedbackActor,
  getFeedbackActor,
  resolveFeedbackActorFromUrt,
  setFeedbackActor,
} from './feedbackContext';

describe('feedbackContext', () => {
  it('maps HIS handshake org and dept fields for user logs', () => {
    const actor = resolveFeedbackActorFromUrt({
      orgId: 'HIS-ORG-ID',
      orgCode: 'HIS-ORG-CODE',
      orgPureName: '瓜沥镇社区卫生服务中心',
      orgName: '不应优先使用的机构名',
      deptId: 'HIS-DEPT-ID',
      deptName: '全科门诊',
      userRoleDepts: [{ deptId: 'ROLE-DEPT-ID', deptName: '角色科室' }],
    }, 'FALLBACK-ORG');

    expect(actor.orgCode).toBe('HIS-ORG-CODE');
    expect(actor.hisOrgId).toBe('HIS-ORG-ID');
    expect(actor.orgName).toBe('瓜沥镇社区卫生服务中心');
    expect(actor.deptId).toBe('HIS-DEPT-ID');
    expect(actor.deptName).toBe('全科门诊');
  });

  it('keeps hisOrgId in cached actor', () => {
    setFeedbackActor({
      orgCode: 'HIS-ORG-CODE',
      hisOrgId: 'HIS-ORG-ID',
      orgName: '瓜沥镇社区卫生服务中心',
      deptId: 'HIS-DEPT-ID',
    });

    expect(getFeedbackActor()).toMatchObject({
      orgCode: 'HIS-ORG-CODE',
      hisOrgId: 'HIS-ORG-ID',
      orgName: '瓜沥镇社区卫生服务中心',
      deptId: 'HIS-DEPT-ID',
    });

    clearFeedbackActor();
  });

  it('does not synthesize hisOrgId from fallback org code', () => {
    const actor = resolveFeedbackActorFromUrt(undefined, 'FALLBACK-ORG-CODE');

    expect(actor.orgCode).toBe('FALLBACK-ORG-CODE');
    expect(actor.hisOrgId).toBeUndefined();
  });
});
