<template>
  <div class="update-checker">
    <div class="header">
      <span class="title">版本更新</span>
      <span class="current-version">v{{ currentVersion }}</span>
    </div>
    
    <div class="content">
      <div v-if="checking" class="status-loading">
        <div class="spinner"></div>
        <span>正在检查更新...</span>
      </div>
      
      <div v-else-if="error" class="status-error">
        <span>{{ error }}</span>
        <button @click="checkAndStore" class="retry-btn">重试</button>
      </div>
      
      <div v-else-if="!updateAvailable" class="status-latest">
        <span>当前已是最新版本</span>
        <button @click="checkAndStore" class="check-btn">检查更新</button>
      </div>
      
      <div v-else class="update-available">
        <div class="new-version-badge">新版本 {{ updateInfo?.version }}</div>
        
        <div class="release-notes" v-if="updateInfo?.body">
          <div class="notes-title">更新内容：</div>
          <div class="notes-content">{{ updateInfo.body }}</div>
        </div>
        
        <div class="actions">
          <div v-if="installing" class="install-progress">
            <div class="progress-bar">
              <div class="progress-fill" :style="{ width: downloadProgress + '%' }"></div>
            </div>
            <span>正在更新... {{ downloadProgress }}%</span>
          </div>
          <button v-else @click="installUpdate" class="install-btn">
            立即更新并重启
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { check } from '@tauri-apps/plugin-updater';
import { getVersion } from '@tauri-apps/api/app';
import { relaunch } from '@tauri-apps/plugin-process';

const currentVersion = ref('');
const checking = ref(false);
const updateAvailable = ref(false);
const updateInfo = ref<any>(null);
const installing = ref(false);
const downloadProgress = ref(0);
const error = ref('');

// Hold reference to the update object
let pendingUpdate: any = null;

onMounted(async () => {
  try {
    currentVersion.value = await getVersion();
  } catch (e) {
    console.error('Failed to get version', e);
    currentVersion.value = '未知';
  }
});

const checkAndStore = async () => {
  checking.value = true;
  error.value = '';
  updateAvailable.value = false;
  
  try {
    const update = await check();
    if (update) {
      pendingUpdate = update;
      updateAvailable.value = true;
      updateInfo.value = {
        version: update.version,
        body: update.body,
        date: update.date
      };
    }
  } catch (e: any) {
    console.error(e);
    error.value = `检查失败: ${e.message || '网络错误或配置无效'}`;
  } finally {
    checking.value = false;
  }
};

const installUpdate = async () => {
  if (!pendingUpdate) return;
  
  installing.value = true;
  downloadProgress.value = 0;
  
  try {
    let downloaded = 0;
    let contentLength = 0;
    
    await pendingUpdate.downloadAndInstall((event: any) => {
      switch (event.event) {
        case 'Started':
          contentLength = event.data.contentLength || 0;
          break;
        case 'Progress':
          downloaded += event.data.chunkLength;
          if (contentLength > 0) {
            downloadProgress.value = Math.round((downloaded / contentLength) * 100);
          }
          break;
        case 'Finished':
          downloadProgress.value = 100;
          break;
      }
    });
    
    await relaunch();
  } catch (e: any) {
    console.error('Update install error:', e);
    // 处理不同类型的错误对象
    let errorMsg = '未知错误';
    if (typeof e === 'string') {
      errorMsg = e;
    } else if (e?.message) {
      errorMsg = e.message;
    } else if (e?.toString && e.toString() !== '[object Object]') {
      errorMsg = e.toString();
    } else {
      // 尝试 JSON 序列化
      try {
        errorMsg = JSON.stringify(e);
      } catch {
        errorMsg = '安装过程中发生未知错误';
      }
    }
    error.value = `更新失败: ${errorMsg}`;
    installing.value = false;
  }
};
</script>

<style scoped>
.update-checker {
  border: 1px solid var(--color-border-light, #e2e8f0);
  border-radius: 12px;
  overflow: hidden;
  background: var(--color-background-white, #fff);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.header {
  background: var(--color-background-gray, #f8fafc);
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border-light, #e2e8f0);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.title {
  font-weight: 600;
  font-size: 16px;
  color: var(--color-text-primary, #164E63);
}

.current-version {
  font-size: 12px;
  color: var(--color-text-muted, #64748b);
  background: var(--color-border-light, #e2e8f0);
  padding: 4px 10px;
  border-radius: 12px;
  font-weight: 500;
}

.content {
  padding: 20px;
}

.status-loading {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--color-text-muted, #64748b);
  font-size: 14px;
}

.spinner {
  width: 18px;
  height: 18px;
  border: 2px solid var(--color-border-light, #cbd5e1);
  border-top-color: var(--color-primary, #0891B2);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.status-error {
  color: var(--color-error, #ef4444);
  font-size: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.retry-btn, .check-btn, .install-btn {
  padding: 10px 20px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all var(--duration-normal) var(--ease-out);
  min-height: 40px;
}

.retry-btn {
  background: var(--color-error-bg, #fee2e2);
  color: var(--color-error, #ef4444);
  align-self: flex-start;
}

.retry-btn:hover {
  background: var(--color-error-border, #fca5a5);
}

.check-btn {
  background: var(--color-primary-100, rgba(8, 145, 178, 0.1));
  color: var(--color-primary, #0891B2);
}

.check-btn:hover {
  background: var(--color-primary-200, rgba(8, 145, 178, 0.2));
}

.install-btn {
  background: var(--color-primary, #0891B2);
  color: white;
  width: 100%;
  box-shadow: 0 4px 12px rgba(8, 145, 178, 0.3);
}

.install-btn:hover {
  background: var(--color-primary-dark, #0E7490);
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(8, 145, 178, 0.4);
}

.status-latest {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: var(--color-cta, #059669);
  font-size: 14px;
  font-weight: 500;
}

.update-available {
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.new-version-badge {
  display: inline-block;
  background: var(--color-success-bg, #D1FAE5);
  color: var(--color-success-text, #166534);
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 16px;
}

.release-notes {
  background: var(--color-background-gray, #f8fafc);
  padding: 16px;
  border-radius: 8px;
  margin-bottom: 20px;
  border: 1px solid var(--color-border-light, #e2e8f0);
}

.notes-title {
  font-size: 12px;
  color: var(--color-text-muted, #64748b);
  margin-bottom: 8px;
  font-weight: 500;
}

.notes-content {
  font-size: 14px;
  color: var(--color-text-strong, #0F172A);
  white-space: pre-wrap;
  line-height: 1.6;
}

.install-progress {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 13px;
  color: var(--color-text-muted, #64748b);
}

.progress-bar {
  height: 8px;
  background: var(--color-border-light, #e2e8f0);
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--color-primary, #0891B2) 0%, var(--color-primary-light, #06B6D4) 100%);
  transition: width var(--duration-slow) var(--ease-out);
  border-radius: 4px;
}
</style>
