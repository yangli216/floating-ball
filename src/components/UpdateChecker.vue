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
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  overflow: hidden;
  background: #fff;
}

.header {
  background: #f8fafc;
  padding: 12px 16px;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.title {
  font-weight: 600;
  color: #334155;
}

.current-version {
  font-size: 12px;
  color: #64748b;
  background: #e2e8f0;
  padding: 2px 8px;
  border-radius: 10px;
}

.content {
  padding: 16px;
}

.status-loading {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #64748b;
  font-size: 14px;
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid #cbd5e1;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.status-error {
  color: #ef4444;
  font-size: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.retry-btn, .check-btn, .install-btn {
  padding: 8px 16px;
  border-radius: 6px;
  border: none;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.retry-btn {
  background: #fee2e2;
  color: #ef4444;
  align-self: flex-start;
}

.check-btn {
  background: #eff6ff;
  color: #3b82f6;
}

.check-btn:hover {
  background: #dbeafe;
}

.install-btn {
  background: #3b82f6;
  color: white;
  width: 100%;
}

.install-btn:hover {
  background: #2563eb;
}

.status-latest {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: #059669;
  font-size: 14px;
}

.new-version-badge {
  display: inline-block;
  background: #dbeafe;
  color: #1d4ed8;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 12px;
}

.release-notes {
  background: #f8fafc;
  padding: 12px;
  border-radius: 6px;
  margin-bottom: 16px;
}

.notes-title {
  font-size: 12px;
  color: #64748b;
  margin-bottom: 4px;
}

.notes-content {
  font-size: 13px;
  color: #334155;
  white-space: pre-wrap;
  line-height: 1.5;
}

.install-progress {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: #64748b;
}

.progress-bar {
  height: 6px;
  background: #e2e8f0;
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: #3b82f6;
  transition: width 0.3s ease;
}
</style>
