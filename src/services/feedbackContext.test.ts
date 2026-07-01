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
      orgCode: 'HIS-ORG-CODE',
      orgPureName: '瓜沥镇社区卫生服务中心',
      orgName: '不应优先使用的机构名',
      deptId: 'TOP-LEVEL-DEPT-ID',
      deptName: '全科门诊',
      userRoleDepts: {
        orgId: 'ROLE-HIS-ORG-ID',
        orgCd: 'ROLE-HIS-ORG-CODE',
        orgName: '角色机构名',
        deptId: 'ROLE-DEPT-ID',
        deptName: '角色科室',
      },
    }, 'FALLBACK-ORG');

    expect(actor.orgCode).toBe('HIS-ORG-CODE');
    expect(actor.hisOrgId).toBe('ROLE-HIS-ORG-ID');
    expect(actor.orgName).toBe('瓜沥镇社区卫生服务中心');
    expect(actor.deptId).toBe('ROLE-DEPT-ID');
    expect(actor.deptName).toBe('全科门诊');
  });

  it('uses only userRoleDepts orgId and deptId for HIS org and dept ids', () => {
    const actor = resolveFeedbackActorFromUrt({
      userRoleDepts: {
        orgId: '63bba6293c6f497752d57250',
        orgCd: 'JG0000021',
        orgName: '长河街道社区卫生服务中心-外科',
        deptId: '63bba6983c6f497752d5852b',
        deptName: '外科',
      },
    }, 'FALLBACK-ORG');

    expect(actor.orgCode).toBe('FALLBACK-ORG');
    expect(actor.hisOrgId).toBe('63bba6293c6f497752d57250');
    expect(actor.orgName).toBeNull();
    expect(actor.deptId).toBe('63bba6983c6f497752d5852b');
    expect(actor.deptName).toBeNull();
  });

  it('does not synthesize ids from userRoleDepts array', () => {
    const actor = resolveFeedbackActorFromUrt({
      userRoleDepts: [{ orgId: 'ARRAY-ORG-ID', deptId: 'ARRAY-DEPT-ID' }],
    });

    expect(actor.hisOrgId).toBeNull();
    expect(actor.deptId).toBeNull();
  });

  it('does not synthesize ids from top-level orgId or deptId', () => {
    const actor = resolveFeedbackActorFromUrt({
      orgId: 'TOP-LEVEL-ORG-ID',
      orgCode: 'HIS-ORG-CODE',
      orgPureName: '瓜沥镇社区卫生服务中心',
      deptId: 'TOP-LEVEL-DEPT-ID',
    });

    expect(actor.orgCode).toBe('HIS-ORG-CODE');
    expect(actor.hisOrgId).toBeNull();
    expect(actor.deptId).toBeNull();
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
