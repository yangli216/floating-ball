import { createApp } from "vue";
import App from "./App.vue";

// 离线图标集：预注册本地 JSON，避免内网环境从 Iconify CDN 拉取
import { addCollection } from "@iconify/vue/offline";
import lucideIcons from "@iconify-json/lucide/icons.json";
import mdiIcons from "@iconify-json/mdi/icons.json";
import healthIcons from "@iconify-json/healthicons/icons.json";
addCollection(lucideIcons as never);
addCollection(mdiIcons as never);
addCollection(healthIcons as never);

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
import { createPinia } from "pinia";

// 在 Vue 应用挂载前初始化主题，避免闪烁
initializeTheme();

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);

app.mount("#app");
