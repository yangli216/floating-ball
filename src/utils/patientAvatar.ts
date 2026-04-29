/**
 * 患者头像解析
 *
 * 根据性别 + 年龄段映射到 public/avatar/ 下的卡通头像切图：
 *   public/avatar/
 *     ├── boyBaby.png      / girlBaby.png         （0-2 岁，或单位为月/天）
 *     ├── boyChild.png     / girlChild.png        （3-12 岁）
 *     ├── teenagerBoy.png  / teenagerGirl.png     （13-17 岁）
 *     ├── men.png          / woman.png            （18-59 岁）
 *     ├── oldman.png       / oldwoman.png         （>= 60 岁）
 *     └── defaultAvtar.png                         （未知性别 / 解析失败）
 *
 * 解析规则：
 *  - 性别优先取代码字段（'1' → 男 / '2' → 女），然后看文本字段；任意位置出现 "男" / "M" 视为男；
 *  - 年龄优先取数值字段；若只有 ageText 则按 "X岁" / "X个月" / "X天" 解析；
 *  - 年龄单位非 "岁" 时一律按婴儿处理。
 */

export type PatientGenderHint = 'M' | 'F' | 'male' | 'female' | string | undefined | null;

export interface PatientAvatarInput {
  gender?: PatientGenderHint;
  /** 性别代码（'1' 男 / '2' 女），来自 HIS / PHIS */
  sdSex?: string | number | null;
  /** 性别文本（如 "男" / "女" / "男性"） */
  sdSexText?: string | null;
  /** 年龄数值（岁） */
  age?: number | string | null;
  /** 年龄数值字段（兼容 PHIS） */
  ageNum?: number | string | null;
  /** 年龄单位，缺省 "岁" */
  ageUnit?: string | null;
  /** 兼容字段：完整年龄文本，例如 "68岁" / "8个月" */
  ageText?: string | null;
}

const DEFAULT_AVATAR = '/avatar/defaultAvtar.png';

function isMaleHint(input: PatientAvatarInput): boolean | null {
  const code = input.sdSex != null ? String(input.sdSex).trim() : '';
  if (code === '1') return true;
  if (code === '2' || code === '0') return false;

  const candidates = [input.gender, input.sdSexText]
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim());

  for (const c of candidates) {
    if (!c) continue;
    if (/^M$/i.test(c) || c.includes('男') || /^male$/i.test(c)) return true;
    if (/^F$/i.test(c) || c.includes('女') || /^female$/i.test(c)) return false;
  }
  return null;
}

/** 把任意年龄输入归一到「岁」；返回 null 表示无法判断。 */
function resolveAgeYears(input: PatientAvatarInput): number | null {
  const explicit = input.age ?? input.ageNum;
  if (explicit != null && explicit !== '') {
    const n = Number(explicit);
    if (Number.isFinite(n)) {
      const unit = (input.ageUnit || '').trim();
      if (unit && !/岁|year|yr/i.test(unit)) {
        // 非岁单位（月 / 天 / 周等）→ 视为婴儿
        return 0;
      }
      return n;
    }
  }

  const text = (input.ageText || '').trim();
  if (text) {
    const yearMatch = text.match(/(\d+(?:\.\d+)?)\s*岁/);
    if (yearMatch) return Number(yearMatch[1]);
    if (/月|天|周|day|week|month/i.test(text)) return 0;
    const bareNum = text.match(/^(\d+(?:\.\d+)?)$/);
    if (bareNum) return Number(bareNum[1]);
  }

  return null;
}

type AgeBand = 'baby' | 'child' | 'teen' | 'adult' | 'old';

function bandForYears(years: number | null): AgeBand {
  if (years == null) return 'adult';
  if (years <= 2) return 'baby';
  if (years <= 12) return 'child';
  if (years <= 17) return 'teen';
  if (years < 60) return 'adult';
  return 'old';
}

const MALE_BY_BAND: Record<AgeBand, string> = {
  baby: '/avatar/boyBaby.png',
  child: '/avatar/boyChild.png',
  teen: '/avatar/teenagerBoy.png',
  adult: '/avatar/men.png',
  old: '/avatar/oldman.png',
};

const FEMALE_BY_BAND: Record<AgeBand, string> = {
  baby: '/avatar/girlBaby.png',
  child: '/avatar/girlChild.png',
  teen: '/avatar/teenagerGirl.png',
  adult: '/avatar/woman.png',
  old: '/avatar/oldwoman.png',
};

/**
 * 主入口：解析得到患者头像 src（始终返回有效路径，缺失会落到默认头像）。
 */
export function resolvePatientAvatar(input: PatientAvatarInput | null | undefined): string {
  if (!input) return DEFAULT_AVATAR;
  const male = isMaleHint(input);
  if (male === null) return DEFAULT_AVATAR;
  const band = bandForYears(resolveAgeYears(input));
  return male ? MALE_BY_BAND[band] : FEMALE_BY_BAND[band];
}

export const PATIENT_AVATAR_FALLBACK = DEFAULT_AVATAR;
