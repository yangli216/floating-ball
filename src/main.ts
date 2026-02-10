import { createApp } from "vue";
import App from "./App.vue";

// 导入全局设计令牌和样式覆盖
import "./styles/design-tokens.css";
import "./styles/global-overrides.css";
import "./styles/utilities.css";

// 导入应用样式（重构后的模块化样式）
import "./styles/global.css";
import "./styles/layouts/app-layout.css";
import "./styles/animations/morph.css";

// 导入主题服务并初始化
import { initializeTheme } from "./services/themeService";

// 在 Vue 应用挂载前初始化主题，避免闪烁
initializeTheme();

createApp(App).mount("#app");
