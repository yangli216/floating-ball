<template>
  <header class="patient-header">
    <div class="patient-card">
      <img class="avatar-img" :src="avatarSrc" alt="头像" draggable="false" />

      <div class="patient-name">{{ displayName }}</div>

      <div class="patient-basic">
        <span v-if="gender">{{ gender }}</span>
        <span v-if="gender && age" class="divider"></span>
        <span v-if="age">{{ age }}</span>
        <template v-if="nationMarital">
          <span v-if="gender || age" class="divider"></span>
          <span>{{ nationMarital }}</span>
        </template>
      </div>

      <div v-if="payType" class="tag-blue">{{ payType }}</div>

      <div v-if="idCard || mobile" class="contact-info">
        <span v-if="idCard">身份证号：{{ idCard }}</span>
        <span v-if="mobile">联系电话：{{ mobile }}</span>
      </div>

      <div
        v-if="allergyDisplay"
        class="tag-allergy"
        :title="`过敏史：${allergyDisplay}`"
      >过敏史</div>
    </div>

    <div v-if="$slots.actions" class="header-actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { resolvePatientAvatar, PATIENT_AVATAR_FALLBACK } from '../utils/patientAvatar';
import { getPatientContextAgeText, getPatientContextGenderText, getPatientContextName } from '../utils/patientContext';

interface PatientLike {
  naPi?: string;
  na_pi?: string;
  name?: string;
  patientName?: string;
  patient_name?: string;
  sdSexText?: string;
  sdSex?: string;
  ageText?: string;
  ageNum?: number | string;
  ageUnit?: string;
  sdNationText?: string;
  sd_nation_text?: string;
  sdMaritalText?: string;
  sd_marital_text?: string;
  idCard?: string;
  mobilePhone?: string;
  mobile_phone?: string;
  phone?: string;
  allergyHistory?: string;
  allergy_history?: string;
  allergy?: string;
  [key: string]: any;
}

const props = withDefaults(defineProps<{
  patient?: PatientLike | null;
  payType?: string;
  avatar?: string;
}>(), {
  patient: null,
  payType: '自费',
  avatar: '',
});

const s = (v: unknown): string => (typeof v === 'string' ? v : '');

const displayName = computed((): string => {
  return getPatientContextName(props.patient as any) || (() => {
    const p = props.patient || {};
    return s(p.naPi) || s(p.na_pi) || s(p.name) || s(p.patientName) || s(p.patient_name) || '未知患者';
  })();
});

const gender = computed((): string => {
  return getPatientContextGenderText(props.patient as any) || (() => {
    const p = props.patient || {};
    return s(p.sdSexText) || s(p.sdSex);
  })();
});

const age = computed((): string => {
  const contextAge = getPatientContextAgeText(props.patient as any);
  if (contextAge) return contextAge;
  const p = props.patient || {};
  if (s(p.ageText)) return s(p.ageText);
  if (p.ageNum != null && p.ageNum !== '') {
    return `${p.ageNum}${s(p.ageUnit) || '岁'}`;
  }
  return '';
});

const nation = computed((): string => {
  const p = props.patient || {};
  return s(p.sdNationText) || s(p.sd_nation_text);
});

const marital = computed((): string => {
  const p = props.patient || {};
  return s(p.sdMaritalText) || s(p.sd_marital_text);
});

const nationMarital = computed((): string => {
  return [nation.value, marital.value].filter(Boolean).join(' | ');
});

const idCard = computed((): string => s(props.patient?.idCard));

const mobile = computed((): string => {
  const p = props.patient || {};
  return s(p.mobilePhone) || s(p.mobile_phone) || s(p.phone);
});

const allergyDisplay = computed((): string => {
  const p = props.patient || {};
  const raw = (s(p.allergyHistory) || s(p.allergy_history) || s(p.allergy)).trim();
  if (!raw) return '';
  if (/^(无|否认|否|none|n\/a|未知|不详)/i.test(raw)) return '';
  return raw;
});

const avatarSrc = computed(() => {
  if (props.avatar) return props.avatar;
  const p = props.patient || {};
  return resolvePatientAvatar({
    sdSex: p.sdSex,
    sdSexText: p.sdSexText,
    age: p.ageNum,
    ageUnit: p.ageUnit,
    ageText: p.ageText,
  }) || PATIENT_AVATAR_FALLBACK;
});
</script>

<style scoped>
.patient-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: nowrap;
  background: linear-gradient(135deg, #1A6FD5 0%, #2B7FE3 50%, #4A9BF5 100%);
  padding: 10px 16px;
  box-shadow: 0 1px 6px rgba(43, 127, 227, 0.2);
  z-index: 10;
  flex-shrink: 0;
  border-bottom: none;
}

.patient-card {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  flex: 1;
  min-width: 0;
  margin-right: 16px;
}

.avatar-img {
  width: 36px;
  height: 36px;
}

.patient-name {
  font-size: 16px;
  font-weight: 700;
  color: #fff;
}

.patient-basic {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.9);
}

.divider {
  width: 1px;
  height: 12px;
  background: rgba(255, 255, 255, 0.4);
}

.tag-blue {
  width: 64px;
  height: 20px;
  background: #E0EFFF;
  border-radius: 10px;
  font-weight: 400;
  font-size: 12px;
  color: #2469F2;
  line-height: 20px;
  text-align: center;
}

.tag-allergy {
  background: #E03134;
  color: #fff;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 400;
  border: 1px solid #FFFFFF;
  cursor: default;
}

.contact-info {
  display: flex;
  align-items: center;
  gap: 16px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.85);
  margin-left: auto;
}

@media (max-width: 800px) {
  .contact-info {
    margin-left: 0;
    width: 100%;
    margin-top: 8px;
  }
}

.header-actions {
  margin-left: auto;
  display: flex;
  gap: 12px;
  align-items: center;
  flex-shrink: 0;
}
</style>
