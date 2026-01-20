<script setup lang="ts">
import Icon from './Icon.vue';
import { ref } from 'vue';

const selectedIcon = ref('mdi:account');
const iconSize = ref(24);
const iconColor = ref('#4a90e2');

// 常用医疗图标示例
const medicalIcons = [
  { name: 'mdi:account-heart', label: '患者' },
  { name: 'mdi:stethoscope', label: '听诊器' },
  { name: 'mdi:pill', label: '药物' },
  { name: 'mdi:hospital-box', label: '医院' },
  { name: 'mdi:clipboard-text', label: '病历' },
  { name: 'mdi:heart-pulse', label: '心率' },
  { name: 'healthicons:stethoscope', label: '听诊器2' },
  { name: 'healthicons:medicines', label: '药品' },
];

// UI 图标示例
const uiIcons = [
  { name: 'lucide:arrow-left', label: '返回' },
  { name: 'lucide:chevron-down', label: '下箭头' },
  { name: 'lucide:settings', label: '设置' },
  { name: 'lucide:message-square', label: '聊天' },
  { name: 'lucide:mic', label: '麦克风' },
  { name: 'lucide:send', label: '发送' },
  { name: 'lucide:copy', label: '复制' },
  { name: 'lucide:x', label: '关闭' },
];

// 系统图标示例
const systemIcons = [
  { name: 'healthicons:lungs', label: '呼吸系统' },
  { name: 'mdi:heart-pulse', label: '循环系统' },
  { name: 'healthicons:stomach', label: '消化系统' },
  { name: 'healthicons:kidneys', label: '泌尿系统' },
  { name: 'mdi:gender-male-female', label: '生殖系统' },
  { name: 'mdi:brain', label: '神经系统' },
  { name: 'healthicons:hormones', label: '内分泌系统' },
  { name: 'mdi:run', label: '运动系统' },
];

const selectIcon = (iconName: string) => {
  selectedIcon.value = iconName;
};
</script>

<template>
  <div class="icon-showcase">
    <h1>Iconify 图标展示</h1>

    <!-- 图标预览器 -->
    <div class="preview-section">
      <h2>图标预览器</h2>
      <div class="preview-container">
        <div class="icon-display">
          <Icon :icon="selectedIcon" :size="iconSize" :color="iconColor" />
        </div>
        <div class="controls">
          <div class="control-group">
            <label>图标名称:</label>
            <input v-model="selectedIcon" type="text" placeholder="例如: mdi:account" />
          </div>
          <div class="control-group">
            <label>大小: {{ iconSize }}px</label>
            <input v-model.number="iconSize" type="range" min="16" max="128" />
          </div>
          <div class="control-group">
            <label>颜色:</label>
            <input v-model="iconColor" type="color" />
          </div>
        </div>
      </div>
      <p class="hint">
        访问 <a href="https://icon-sets.iconify.design/" target="_blank" rel="noopener">
          https://icon-sets.iconify.design/
        </a> 搜索更多图标
      </p>
    </div>

    <!-- 医疗图标 -->
    <div class="icon-section">
      <h2>医疗相关图标</h2>
      <div class="icon-grid">
        <div
          v-for="icon in medicalIcons"
          :key="icon.name"
          class="icon-item"
          @click="selectIcon(icon.name)"
        >
          <Icon :icon="icon.name" size="32" />
          <span>{{ icon.label }}</span>
          <code>{{ icon.name }}</code>
        </div>
      </div>
    </div>

    <!-- UI 图标 -->
    <div class="icon-section">
      <h2>UI 界面图标</h2>
      <div class="icon-grid">
        <div
          v-for="icon in uiIcons"
          :key="icon.name"
          class="icon-item"
          @click="selectIcon(icon.name)"
        >
          <Icon :icon="icon.name" size="32" />
          <span>{{ icon.label }}</span>
          <code>{{ icon.name }}</code>
        </div>
      </div>
    </div>

    <!-- 系统图标 -->
    <div class="icon-section">
      <h2>身体系统图标</h2>
      <div class="icon-grid">
        <div
          v-for="icon in systemIcons"
          :key="icon.name"
          class="icon-item"
          @click="selectIcon(icon.name)"
        >
          <Icon :icon="icon.name" size="32" />
          <span>{{ icon.label }}</span>
          <code>{{ icon.name }}</code>
        </div>
      </div>
    </div>

    <!-- 使用示例 -->
    <div class="code-section">
      <h2>使用示例</h2>
      <pre><code>&lt;script setup&gt;
import Icon from './Icon.vue';
&lt;/script&gt;

&lt;template&gt;
  &lt;!-- 基本使用 --&gt;
  &lt;Icon icon="mdi:account" /&gt;

  &lt;!-- 自定义大小和颜色 --&gt;
  &lt;Icon icon="lucide:settings" size="24" color="#4a90e2" /&gt;

  &lt;!-- 在按钮中使用 --&gt;
  &lt;button&gt;
    &lt;Icon icon="lucide:send" inline /&gt;
    发送
  &lt;/button&gt;

  &lt;!-- 旋转图标 --&gt;
  &lt;Icon icon="lucide:arrow-right" rotate="90" /&gt;
&lt;/template&gt;</code></pre>
    </div>
  </div>
</template>

<style scoped>
.icon-showcase {
  max-width: 1200px;
  margin: 0 auto;
  padding: 40px 20px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

h1 {
  font-size: 32px;
  margin-bottom: 30px;
  color: #2c3e50;
}

h2 {
  font-size: 24px;
  margin: 30px 0 20px;
  color: #34495e;
}

/* 预览器 */
.preview-section {
  background: #f8f9fa;
  padding: 30px;
  border-radius: 12px;
  margin-bottom: 40px;
}

.preview-container {
  display: flex;
  gap: 40px;
  align-items: center;
}

.icon-display {
  flex-shrink: 0;
  width: 200px;
  height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.controls {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.control-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.control-group label {
  font-weight: 500;
  color: #555;
}

.control-group input[type="text"] {
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
}

.control-group input[type="range"] {
  width: 100%;
}

.control-group input[type="color"] {
  width: 60px;
  height: 40px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

.hint {
  margin-top: 20px;
  font-size: 14px;
  color: #666;
}

.hint a {
  color: #4a90e2;
  text-decoration: none;
}

.hint a:hover {
  text-decoration: underline;
}

/* 图标网格 */
.icon-section {
  margin-bottom: 40px;
}

.icon-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 16px;
}

.icon-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 20px;
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.icon-item:hover {
  border-color: #4a90e2;
  box-shadow: 0 2px 8px rgba(74, 144, 226, 0.2);
  transform: translateY(-2px);
}

.icon-item span {
  font-size: 14px;
  color: #2c3e50;
  text-align: center;
}

.icon-item code {
  font-size: 11px;
  color: #666;
  background: #f5f5f5;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
  text-align: center;
  word-break: break-all;
}

/* 代码示例 */
.code-section {
  background: #282c34;
  color: #abb2bf;
  padding: 30px;
  border-radius: 12px;
  overflow-x: auto;
}

.code-section pre {
  margin: 0;
  font-family: 'Courier New', monospace;
  font-size: 14px;
  line-height: 1.6;
}

.code-section code {
  color: #abb2bf;
}
</style>
