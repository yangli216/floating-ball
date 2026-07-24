<script setup lang="ts">
import type { FusedFollowUpFormState } from '../../model/followUpFormModel';

defineProps<{
  hasHypertension: boolean;
  hasDiabetes: boolean;
}>();

const form = defineModel<FusedFollowUpFormState>({ required: true });
</script>

<template>
  <div class="form-grid">
    <label>吸烟情况 sdWehtherSmoke<span class="required">*</span>
      <select v-model="form.sdWehtherSmoke">
        <option value="">请选择</option>
        <option value="0">不吸</option>
        <option value="1">吸</option>
        <option value="2">已戒烟</option>
      </select>
    </label>
    <label>日吸烟量 daySmoke
      <input
        v-model="form.daySmoke"
        inputmode="numeric"
        maxlength="2"
        :disabled="form.sdWehtherSmoke === '0' || form.sdWehtherSmoke === '2'"
      />
    </label>
    <label>日吸烟目标量 advDaySmoke
      <input
        v-model="form.advDaySmoke"
        inputmode="numeric"
        maxlength="2"
        :disabled="form.sdWehtherSmoke === '0' || form.sdWehtherSmoke === '2'"
      />
    </label>
    <label>饮酒情况 sdWhetherDrink<span class="required">*</span>
      <select v-model="form.sdWhetherDrink">
        <option value="">请选择</option>
        <option value="0">从不</option>
        <option value="1">偶尔</option>
        <option value="2">经常</option>
        <option value="3">每天</option>
        <option value="4">已戒酒</option>
      </select>
    </label>
    <label>日饮酒量 dayDrink
      <input
        v-model="form.dayDrink"
        inputmode="decimal"
        :disabled="form.sdWhetherDrink === '0' || form.sdWhetherDrink === '4'"
      />
    </label>
    <label>日饮酒目标量 advDayDrink
      <input
        v-model="form.advDayDrink"
        inputmode="decimal"
        :disabled="form.sdWhetherDrink === '0' || form.sdWhetherDrink === '4'"
      />
    </label>
    <label>主要饮酒种类 sdMainDrinking
      <select
        v-model="form.sdMainDrinking"
        :disabled="form.sdWhetherDrink === '0' || form.sdWhetherDrink === '4'"
      >
        <option value="">请选择</option>
        <option value="1">白酒</option>
        <option value="2">红酒</option>
        <option value="3">啤酒</option>
        <option value="4">黄酒</option>
        <option value="0">其他</option>
      </select>
    </label>
    <label>每周运动 sportWeek<span class="required">*</span>
      <input v-model="form.sportWeek" inputmode="numeric" maxlength="2" />
    </label>
    <label>每周运动目标 advSportWeek<span class="required">*</span>
      <input v-model="form.advSportWeek" inputmode="numeric" maxlength="2" />
    </label>
    <label>每次运动时长 sportMinute<span class="required">*</span>
      <input v-model="form.sportMinute" inputmode="numeric" maxlength="3" />
    </label>
    <label>每次运动目标 advSportMinute<span class="required">*</span>
      <input v-model="form.advSportMinute" inputmode="numeric" maxlength="3" />
    </label>
    <template v-if="hasHypertension">
      <label>日摄盐量 sdSalt<span class="required">*</span>
        <input v-model="form.sdSalt" inputmode="decimal" maxlength="3" />
      </label>
      <label>日摄盐目标量 sdAdvSalt<span class="required">*</span>
        <input v-model="form.sdAdvSalt" inputmode="decimal" maxlength="3" />
      </label>
    </template>
    <template v-if="hasDiabetes">
      <label>主食 rice<span class="required">*</span>
        <input v-model="form.rice" inputmode="numeric" maxlength="4" />
      </label>
      <label>目标主食 targRice<span class="required">*</span>
        <input v-model="form.targRice" inputmode="numeric" maxlength="4" />
      </label>
    </template>
  </div>
</template>
