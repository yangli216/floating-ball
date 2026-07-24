<script setup lang="ts">
import { computed, shallowRef } from 'vue';
import type {
  ClinicalPathDiagramConfig,
  ClinicalPathHotspot,
} from '../lib/clinicalPathDiagram';
import { getClinicalPathHotspotStyle } from '../lib/clinicalPathDiagram';
import ClinicalPathDrawer from './ClinicalPathDrawer.vue';

const props = defineProps<{
  diagram: ClinicalPathDiagramConfig;
}>();

const activeHotspotId = shallowRef('');
const activeHotspot = computed(() => (
  props.diagram.hotspots.find((item) => item.id === activeHotspotId.value) || null
));
const stageStyle = computed(() => ({
  aspectRatio: `${props.diagram.naturalWidth} / ${props.diagram.naturalHeight}`,
}));

function toggleHotspot(hotspot: ClinicalPathHotspot): void {
  activeHotspotId.value = activeHotspotId.value === hotspot.id ? '' : hotspot.id;
}

function closeDrawer(): void {
  activeHotspotId.value = '';
}
</script>

<template>
  <section class="diagram-viewport" :aria-label="diagram.title">
    <div class="diagram-stage" :style="stageStyle">
      <img
        class="diagram-background"
        :src="diagram.backgroundUrl"
        :alt="`${diagram.title}完整流程图`"
        draggable="false"
      >

      <button
        v-for="hotspot in diagram.hotspots"
        :key="hotspot.id"
        type="button"
        class="diagram-hotspot"
        :class="{ active: activeHotspotId === hotspot.id }"
        :style="getClinicalPathHotspotStyle(diagram, hotspot)"
        :aria-label="`查看${hotspot.label}说明`"
        :aria-pressed="activeHotspotId === hotspot.id"
        :title="hotspot.label"
        @click="toggleHotspot(hotspot)"
      >
        <img
          v-if="activeHotspotId === hotspot.id"
          :src="hotspot.activeImageUrl"
          alt=""
          draggable="false"
        >
      </button>

      <Transition name="drawer">
        <ClinicalPathDrawer
          v-if="activeHotspot"
          :drawer="activeHotspot.drawer"
          @close="closeDrawer"
        />
      </Transition>
    </div>
  </section>
</template>

<style scoped>
.diagram-viewport {
  min-width: 0;
  min-height: 0;
  padding: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: auto;
  background: #f4f7fb;
}

.diagram-stage {
  position: relative;
  height: 100%;
  max-width: 100%;
  flex: 0 0 auto;
  overflow: hidden;
  background: #fff;
  box-shadow: 0 1px 5px rgba(15, 23, 42, 0.12);
}

.diagram-background {
  width: 100%;
  height: 100%;
  display: block;
  user-select: none;
}

.diagram-hotspot {
  position: absolute;
  padding: 0;
  overflow: hidden;
  background: transparent;
  border: 0;
  cursor: pointer;
  z-index: 1;
}

.diagram-hotspot:hover {
  background: rgba(64, 136, 254, 0.06);
  outline: 1px dashed rgba(64, 136, 254, 0.55);
}

.diagram-hotspot:focus-visible {
  outline: 3px solid rgba(37, 99, 235, 0.8);
  outline-offset: 2px;
}

.diagram-hotspot img {
  width: 100%;
  height: 100%;
  display: block;
}

.drawer-enter-active,
.drawer-leave-active {
  transition: transform 0.24s ease, opacity 0.24s ease;
}

.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
  transform: translateX(100%);
}

@media (max-aspect-ratio: 4 / 3) {
  .diagram-stage {
    width: 100%;
    height: auto;
  }
}
</style>
