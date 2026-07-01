/**
 * 反馈上下文：缓存 SDK 握手阶段解析出的医生 / 机构 / 科室信息，供 userFeedback / voiceFeedback
 * 在提交时统一带上"反馈医生 + 机构 + 科室"。
 *
 * 数据来源：useEventListeners 的 sdk-handshake 监听器在解析 ctx.extra.urt 后写入。
 * 不依赖 Pinia / Vue 响应式（feedback payload 只在提交瞬间读取一次）。
 */

export interface FeedbackActor {
  doctorId?: string | null;
  doctorName?: string | null;
  orgCode?: string | null;
  hisOrgId?: string | null;
  orgName?: string | null;
  deptId?: string | null;
  deptName?: string | null;
}

let cachedActor: FeedbackActor = {};

function trim(value: unknown): string | null {
  if (typeof value === 'string') {
    const t = value.trim();
    return t || null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

export function setFeedbackActor(actor: FeedbackActor): void {
  cachedActor = {
    doctorId: trim(actor.doctorId),
    doctorName: trim(actor.doctorName),
    orgCode: trim(actor.orgCode),
    hisOrgId: trim(actor.hisOrgId),
    orgName: trim(actor.orgName),
    deptId: trim(actor.deptId),
    deptName: trim(actor.deptName),
  };
}

export function clearFeedbackActor(): void {
  cachedActor = {};
}

export function getFeedbackActor(): FeedbackActor {
  return { ...cachedActor };
}

/**
 * 从 SDK 握手 ctx.extra.urt 结构里尽力解析 actor 字段。
 *
 * urt 常见结构：
 * {
 *   orgCode, orgPureName, orgName, hospitalName,
 *   userId / idEmp / idDoctor / idUser,
 *   userName / naDoctor / naEmp,
 *   deptId / deptName,
 *   userRoleDepts: { orgId, orgCd, orgName, deptId, deptName, ... } | [{ ... }] | string(JSON)
 * }
 */
export function resolveFeedbackActorFromUrt(
  urt: Record<string, unknown> | undefined,
  fallbackOrgCode?: string | null
): FeedbackActor {
  if (!urt) {
    return {
      orgCode: trim(fallbackOrgCode),
    };
  }

  const doctorId = trim(urt.idDoctor)
    ?? trim(urt.idEmp)
    ?? trim(urt.userId)
    ?? trim(urt.idUser)
    ?? trim((urt as Record<string, unknown>)['id_user']);

  const doctorName = trim(urt.naDoctor)
    ?? trim(urt.naEmp)
    ?? trim(urt.userName)
    ?? trim(urt.naUser)
    ?? trim((urt as Record<string, unknown>)['na_user']);

  const orgCode = trim(urt.orgCode)
    ?? trim(urt.cdOrg)
    ?? trim(fallbackOrgCode);

  const deptName = trim(urt.deptName);

  // id_his_org / id_dept 只来自 urt.userRoleDepts 对象的同名字段，不从数组或其他字段兜底。
  const rawDepts = urt.userRoleDepts;
  const parsedDepts = (() => {
    if (typeof rawDepts === 'string') {
      try {
        return JSON.parse(rawDepts);
      } catch {
        return undefined;
      }
    }
    return rawDepts;
  })();

  const hisOrgId = parsedDepts && !Array.isArray(parsedDepts) && typeof parsedDepts === 'object'
    ? trim((parsedDepts as Record<string, unknown>).orgId)
    : null;
  const deptId = parsedDepts && !Array.isArray(parsedDepts) && typeof parsedDepts === 'object'
    ? trim((parsedDepts as Record<string, unknown>).deptId)
    : null;

  const orgName = trim(urt.orgPureName);

  return {
    doctorId,
    doctorName,
    orgCode,
    hisOrgId,
    orgName,
    deptId,
    deptName,
  };
}
