/**
 * App 级 SDK handshake controller。
 *
 * 负责解析 HIS SDK 握手上下文，并初始化 HIS 服务、反馈 actor 和医学目录上下文。
 * Tauri 事件订阅仍由 useEventListeners 管理。
 *
 * @module app/events/useSdkHandshakeController
 */

import { getHisService, resetHisAdapter, resetHisService } from '@/services/his';
import { medicalDataService } from '@/services/medicalData';
import { resolveFeedbackActorFromUrt, setFeedbackActor } from '@/services/feedbackContext';

export interface SdkHandshakePayload {
  origin: string;
  href: string;
  extra?: {
    emrAccessToken?: string;
    urt?: unknown;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

const HANDSHAKE_ORG_CODE_FIELDS = [
  'orgCode',
  'cdOrg',
  'institutionCode',
  'institutionId',
  'hospitalCode',
  'hospitalId',
  'organizationCode',
  'medicalInstitutionCode'
] as const;

const HANDSHAKE_TENANT_ID_FIELDS = [
  'idTet',
  'tenantId',
  'tenantCode',
  'tetId'
] as const;

function readHandshakeStringField(
  payload: Record<string, unknown> | undefined,
  field: string
): string | null {
  if (!payload) {
    return null;
  }

  const value = payload[field];
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function resolveUrtPayload(raw: unknown): Record<string, unknown> | undefined {
  if (!raw) {
    return undefined;
  }

  if (typeof raw === 'object') {
    return raw as Record<string, unknown>;
  }

  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return undefined;
    }
  }

  return undefined;
}

function resolveHandshakeOrgCode(ctx: SdkHandshakePayload): string | null {
  const extra = (ctx.extra && typeof ctx.extra === 'object') ? ctx.extra as Record<string, unknown> : undefined;
  const urt = resolveUrtPayload(extra?.urt);
  const nestedSources: Array<Record<string, unknown> | undefined> = [
    urt,
    ctx as Record<string, unknown>,
    extra,
    (extra?.org && typeof extra.org === 'object') ? extra.org as Record<string, unknown> : undefined,
    (extra?.institution && typeof extra.institution === 'object') ? extra.institution as Record<string, unknown> : undefined,
    (extra?.hospital && typeof extra.hospital === 'object') ? extra.hospital as Record<string, unknown> : undefined,
    (extra?.tenant && typeof extra.tenant === 'object') ? extra.tenant as Record<string, unknown> : undefined,
  ];

  const orgId = readHandshakeStringField(urt, 'orgId');
  if (orgId) {
    return orgId;
  }

  for (const source of nestedSources) {
    for (const field of HANDSHAKE_ORG_CODE_FIELDS) {
      const value = readHandshakeStringField(source, field);
      if (value) {
        return value;
      }
    }
  }

  return null;
}

function resolveHandshakeTenantId(ctx: SdkHandshakePayload): string | null {
  const extra = (ctx.extra && typeof ctx.extra === 'object') ? ctx.extra as Record<string, unknown> : undefined;
  const urt = resolveUrtPayload(extra?.urt);
  const nestedSources: Array<Record<string, unknown> | undefined> = [
    urt,
    ctx as Record<string, unknown>,
    extra,
    (extra?.tenant && typeof extra.tenant === 'object') ? extra.tenant as Record<string, unknown> : undefined,
    (extra?.org && typeof extra.org === 'object') ? extra.org as Record<string, unknown> : undefined,
  ];

  for (const source of nestedSources) {
    for (const field of HANDSHAKE_TENANT_ID_FIELDS) {
      const value = readHandshakeStringField(source, field);
      if (value) {
        return value;
      }
    }
  }

  return null;
}

function resolveHandshakeUserRoleDeptIds(ctx: SdkHandshakePayload): string[] {
  const extra = (ctx.extra && typeof ctx.extra === 'object') ? ctx.extra as Record<string, unknown> : undefined;
  const urt = resolveUrtPayload(extra?.urt);
  const rawUserRoleDepts = urt?.userRoleDepts;

  const parsedUserRoleDepts = (() => {
    if (typeof rawUserRoleDepts === 'string') {
      try {
        return JSON.parse(rawUserRoleDepts);
      } catch {
        return undefined;
      }
    }

    return rawUserRoleDepts;
  })();

  const collectDeptIds = (value: unknown): string[] => {
    if (!value) {
      return [];
    }

    if (typeof value === 'string') {
      return value.trim() ? [value.trim()] : [];
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return [String(value)];
    }

    if (Array.isArray(value)) {
      return value.flatMap((item) => collectDeptIds(item));
    }

    if (typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const directDeptId = record.deptId;
      if (typeof directDeptId === 'string' && directDeptId.trim()) {
        return [directDeptId.trim()];
      }
      if (typeof directDeptId === 'number' && Number.isFinite(directDeptId)) {
        return [String(directDeptId)];
      }

      return Object.values(record).flatMap((item) => collectDeptIds(item));
    }

    return [];
  };

  return Array.from(new Set(
    collectDeptIds(parsedUserRoleDepts)
      .filter(Boolean)
  ));
}

function resolveHandshakeBaseUrl(ctx: SdkHandshakePayload): string | null {
  const origin = String(ctx.origin || '').trim();
  if (!origin) {
    return null;
  }

  if (!/^https?:\/\//i.test(origin)) {
    console.warn('[SdkHandshakeController] Ignored unsupported HIS origin from handshake:', origin);
    return null;
  }

  return origin;
}

export function useSdkHandshakeController() {
  async function handleSdkHandshake(ctx: SdkHandshakePayload): Promise<void> {
    console.log('[SdkHandshakeController] SDK Handshake received:', ctx);

    const baseUrl = resolveHandshakeBaseUrl(ctx);
    const token = ctx.extra?.emrAccessToken;
    const orgCode = resolveHandshakeOrgCode(ctx);
    const tenantId = resolveHandshakeTenantId(ctx);
    const userRoleDeptIds = resolveHandshakeUserRoleDeptIds(ctx);

    const urtForActor = resolveUrtPayload(ctx.extra?.urt);
    setFeedbackActor(resolveFeedbackActorFromUrt(urtForActor, orgCode));

    if (baseUrl && token) {
      getHisService(baseUrl, { token, userRoleDeptIds });
      resetHisAdapter();
      console.log('[SdkHandshakeController] HisService initialized with origin:', baseUrl, {
        hasToken: Boolean(token),
        orgCode,
        tenantId,
        userRoleDeptIds,
      });
    } else {
      resetHisService();
      resetHisAdapter();
      console.warn('[SdkHandshakeController] Handshake missing baseUrl or tk token, medical catalog sync skipped', {
        hasBaseUrl: Boolean(baseUrl),
        hasToken: Boolean(token),
        orgCode,
        tenantId,
        userRoleDeptIds,
      });
    }

    if (!orgCode) {
      console.warn('[SdkHandshakeController] Handshake did not resolve orgCode, org-scoped medical catalogs will be skipped');
    }

    await medicalDataService.setCatalogContext({ orgCode, tenantId });
  }

  return {
    handleSdkHandshake,
  };
}
