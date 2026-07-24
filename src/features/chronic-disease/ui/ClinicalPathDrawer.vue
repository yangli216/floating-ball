<script setup lang="ts">
import { computed } from 'vue';
import Icon from '@shared/ui/Icon.vue';
import type {
  ClinicalPathDrawerConfig,
  ClinicalPathTableColumn,
} from '../lib/clinicalPathDiagram';

interface RenderedCell {
  column: ClinicalPathTableColumn;
  value: string;
  rowSpan: number;
}

const props = defineProps<{
  drawer: ClinicalPathDrawerConfig;
}>();

const emit = defineEmits<{
  close: [];
}>();

const renderedRows = computed<RenderedCell[][]>(() => {
  if (props.drawer.kind !== 'table') return [];
  const { columns, rows, rowSpanField } = props.drawer;

  return rows.map((row, rowIndex) => columns.map((column) => {
    if (column.field !== rowSpanField) {
      return { column, value: row[column.field] || '', rowSpan: 1 };
    }
    if (rowIndex > 0 && rows[rowIndex - 1]?.[column.field] === row[column.field]) {
      return { column, value: row[column.field] || '', rowSpan: 0 };
    }

    let rowSpan = 1;
    while (rows[rowIndex + rowSpan]?.[column.field] === row[column.field]) {
      rowSpan += 1;
    }
    return { column, value: row[column.field] || '', rowSpan };
  }));
});
</script>

<template>
  <aside
    class="path-drawer"
    :style="{ width: `${drawer.widthPercent}%` }"
    aria-label="路径说明"
  >
    <header class="drawer-header">
      <div class="drawer-title">
        <span aria-hidden="true" />
        <strong>路径说明</strong>
      </div>
      <button type="button" aria-label="关闭路径说明" title="关闭路径说明" @click="emit('close')">
        <Icon icon="lucide:x" size="19" />
      </button>
    </header>

    <div class="drawer-content">
      <template v-if="drawer.kind === 'text'">
        <p v-for="item in drawer.items" :key="item" class="drawer-text">{{ item }}</p>
      </template>

      <table v-else class="drawer-table">
        <thead>
          <tr>
            <th
              v-for="column in drawer.columns"
              :key="column.field"
              scope="col"
              :class="column.align === 'center' ? 'align-center' : undefined"
            >
              {{ column.title }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, rowIndex) in renderedRows" :key="rowIndex">
            <td
              v-for="cell in row.filter((item) => item.rowSpan > 0)"
              :key="cell.column.field"
              :rowspan="cell.rowSpan"
              :class="cell.column.align === 'center' ? 'align-center' : undefined"
            >
              {{ cell.value }}
            </td>
          </tr>
        </tbody>
      </table>

      <p v-if="drawer.source" class="drawer-source">——{{ drawer.source }}</p>
    </div>
  </aside>
</template>

<style scoped>
.path-drawer {
  position: absolute;
  inset: 0 0 0 auto;
  min-width: 310px;
  max-width: 72%;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  color: #262626;
  background: #fff;
  box-shadow: 0 0 8px 2px rgba(15, 23, 42, 0.18);
  z-index: 3;
}

.drawer-header {
  min-height: 58px;
  padding: 14px 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #edf2f7;
}

.drawer-title {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 14px;
}

.drawer-title span {
  width: 4px;
  height: 17px;
  background: #4088fe;
  border-radius: 2px;
}

.drawer-header button {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  color: #64748b;
  background: transparent;
  border: 0;
  border-radius: 5px;
}

.drawer-header button:hover {
  color: #1d4ed8;
  background: #eff6ff;
}

.drawer-content {
  min-height: 0;
  padding: 4px 18px 18px;
  overflow: auto;
  font-size: 13px;
}

.drawer-text {
  margin: 0 0 8px;
  padding-left: 2em;
  text-indent: -2em;
  line-height: 1.65;
}

.drawer-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.drawer-table th,
.drawer-table td {
  padding: 9px;
  border: 1px solid #c1d3e8;
  line-height: 1.5;
  text-align: left;
  white-space: pre-line;
}

.drawer-table th {
  color: #262626;
  background: #ebf4ff;
  font-weight: 700;
}

.drawer-table .align-center {
  text-align: center;
}

.drawer-source {
  margin: 18px 0 0;
  color: #8a94a3;
  text-align: right;
  font-size: 11px;
}

@media (max-width: 760px) {
  .path-drawer {
    width: 78% !important;
    min-width: 0;
    max-width: 78%;
  }
}
</style>
