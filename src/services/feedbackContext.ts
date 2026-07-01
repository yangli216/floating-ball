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
 *   orgId, orgCode, orgPureName, orgName, hospitalName,
 *   userId / idEmp / idDoctor / idUser,
 *   userName / naDoctor / naEmp,
 *   deptId / deptName,
 *   userRoleDepts: [{ deptId, naDept, deptName, ... }] | string(JSON)
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
    ?? trim(urt.orgId)
    ?? trim(fallbackOrgCode);

  const hisOrgId = trim(urt.orgId);

  const orgName = trim(urt.orgPureName)
    ?? trim(urt.orgName)
    ?? trim(urt.naOrg)
    ?? trim(urt.hospitalName);

  // PHIS 顶层 deptId 是当前登录/接诊科室的优先来源；userRoleDepts 仅作兼容兜底。
  let deptId = trim((urt as any).deptId)
    ?? trim((urt as any).idDept)
    ?? trim((urt as any).id_dept)
    ?? null;
  let deptName = trim((urt as any).deptName)
    ?? trim((urt as any).naDept)
    ?? trim((urt as any).na_dept)
    ?? trim((urt as any).deptShortName)
    ?? trim((urt as any).naDeptShort)
    ?? null;

  // 尝试从 userRoleDepts 任一层级里取首个 (deptId, deptName) 对作为兜底
  // PHIS 实际结构存在多种可能：
  //   1) [{ deptId, deptName | naDept }]
  //   2) "[{...}]" JSON 字符串
  //   3) { "<deptId>": [{ deptId | idDept, deptName | naDept }, ...] }
  //   4) { "<roleKey>": { deptId, deptName } }
  // 这里做深度遍历，找到第一个含科室名称的对象即可
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

  type DeptCandidate = { id?: string | null; name?: string | null };
  const visited = new WeakSet<object>();
  const queue: Array<{ value: unknown; outerKey?: string }> = [{ value: parsedDepts }];

  let bestDept: DeptCandidate | null = null;

  while (queue.length > 0 && !bestDept) {
    const { value, outerKey } = queue.shift()!;

    if (Array.isArray(value)) {
      for (const item of value) {
        queue.push({ value: item, outerKey });
      }
      continue;
    }

    if (value && typeof value === 'object') {
      if (visited.has(value as object)) continue;
      visited.add(value as object);

      const record = value as Record<string, unknown>;

      const candidateId = trim(record.deptId)
        ?? trim(record.idDept)
        ?? trim(record['id_dept'])
        ?? trim(outerKey);

      const candidateName = trim(record.deptName)
        ?? trim(record.naDept)
        ?? trim(record['na_dept'])
        ?? trim(record.deptShortName)
        ?? trim(record.naDeptShort);

      if (candidateName) {
        bestDept = { id: candidateId, name: candidateName };
        break;
      }

      // 没找到名称，但若顶层是 map：把每个 entry 推入队列，并把 key 作为兜底 deptId
      for (const [k, v] of Object.entries(record)) {
        queue.push({ value: v, outerKey: k });
      }
    }
  }

  if (bestDept && !deptId) {
    deptId = bestDept.id ?? null;
  }
  if (bestDept && !deptName) {
    deptName = bestDept.name ?? null;
  }

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
