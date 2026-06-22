/**
 * MedHermes Loader v1.0.0
 * 智医助理引导加载器 —— HIS 本地部署，功能纯粹，极少更新
 *
 * 职责：
 *  1. 检测 MedHermes 桌面端是否在线
 *  2. 不在线时通过 med-hermes:// 协议尝试拉起
 *  3. 从 CDN 动态加载完整 SDK (med-hermes-sdk.js)
 *  4. 加载完成后自动初始化并通知 HIS
 *
 * 用法：
 *  <script src="/local/med-hermes-loader.js"
 *          data-sdk-url="https://cdn.example.com/med-hermes-sdk.js"
 *          data-auto-init="true">
 *  </script>
 *  <script>
 *    MedHermesLoader.ready(function(mh) {
 *      mh.on('draft', function(r) { ... });
 *      mh.startConsultation({ idPi: '123', naPi: '张三', ... });
 *    });
 *  </script>
 *
 * @license MIT
 */
(function () {
  'use strict';

  // ─── 配置 ───

  var DEFAULTS = {
    bridgeUrl: 'http://127.0.0.1:8081/api',
    scheme: 'med-hermes',
    pingTimeout: 2000,
    launchWaitMs: 4000,
    maxRetries: 2,
    retryInterval: 3000
  };

  // 从 <script> 标签读取配置
  var currentScript = document.currentScript || (function () {
    var scripts = document.getElementsByTagName('script');
    return scripts[scripts.length - 1];
  })();

  var sdkUrl = currentScript.getAttribute('data-sdk-url') || '';
  var autoInit = currentScript.getAttribute('data-auto-init') !== 'false';
  var bridgeUrl = currentScript.getAttribute('data-bridge-url') || DEFAULTS.bridgeUrl;
  var scheme = currentScript.getAttribute('data-scheme') || DEFAULTS.scheme;

  // 如果未显式指定 SDK URL，从小球本地 HTTP 服务推导
  // bridgeUrl 通常是 http://127.0.0.1:8081/api，去掉 /api 得到 baseOrigin
  if (!sdkUrl) {
    var baseOrigin = bridgeUrl.replace(/\/api\/?$/, '');
    sdkUrl = baseOrigin + '/sdk/med-hermes-sdk.js';
    log('SDK URL 自动推导为: ' + sdkUrl);
  }

  // ─── 状态 ───

  var state = {
    online: false,
    sdkLoaded: false,
    instance: null,
    readyCallbacks: [],
    errorCallbacks: []
  };

  // ─── 工具函数 ───

  function log(msg) {
    console.log('[MedHermes Loader] ' + msg);
  }

  function ping(url, timeout) {
    return new Promise(function (resolve, reject) {
      var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timer = setTimeout(function () {
        if (controller) controller.abort();
        reject(new Error('timeout'));
      }, timeout || DEFAULTS.pingTimeout);

      var opts = { method: 'GET' };
      if (controller) opts.signal = controller.signal;

      fetch(url + '/health', opts)
        .then(function (res) {
          clearTimeout(timer);
          if (res.ok) {
            res.json().then(resolve).catch(function () { resolve({ status: 'success' }); });
          } else {
            reject(new Error('HTTP ' + res.status));
          }
        })
        .catch(function (err) {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  function appendQueryParam(url, key, value) {
    if (!value || url.indexOf(key + '=') !== -1) return url;
    return url + (url.indexOf('?') === -1 ? '?' : '&') + encodeURIComponent(key) + '=' + encodeURIComponent(value);
  }

  function launchViaProtocol(schemeName) {
    var url = schemeName + '://launch';
    log('尝试通过协议拉起: ' + url);

    // iframe 方式，兼容性最佳
    var iframe = document.createElement('iframe');
    iframe.style.cssText = 'display:none;width:0;height:0;border:0;';
    iframe.src = url;
    document.body.appendChild(iframe);
    setTimeout(function () {
      try { document.body.removeChild(iframe); } catch (_) {}
    }, 3000);
  }

  function loadScript(url) {
    return new Promise(function (resolve, reject) {
      if (!url) {
        reject(new Error('SDK URL 未配置。请设置 data-sdk-url 属性。'));
        return;
      }
      // 防止重复加载
      var existing = document.querySelector('script[src="' + url + '"]');
      if (existing) {
        resolve();
        return;
      }

      var script = document.createElement('script');
      script.src = url;
      script.async = true;
      script.onload = function () {
        log('SDK 加载完成');
        resolve();
      };
      script.onerror = function () {
        reject(new Error('SDK 加载失败: ' + url));
      };
      document.head.appendChild(script);
    });
  }

  function fireReady(instance) {
    state.instance = instance;
    for (var i = 0; i < state.readyCallbacks.length; i++) {
      try { state.readyCallbacks[i](instance); } catch (e) { console.error(e); }
    }
  }

  function fireError(err) {
    for (var i = 0; i < state.errorCallbacks.length; i++) {
      try { state.errorCallbacks[i](err); } catch (e) { console.error(e); }
    }
  }

  // ─── 核心流程 ───

  function detectAndLaunch(retries) {
    retries = retries || 0;
    log('检测桌面端状态 (第 ' + (retries + 1) + ' 次)...');

    return ping(bridgeUrl)
      .then(function (info) {
        state.online = true;
        log('桌面端在线, version=' + (info.version || 'unknown'));
        sdkUrl = appendQueryParam(sdkUrl, 'v', info.version || '');
        return true;
      })
      .catch(function () {
        state.online = false;
        if (retries === 0) {
          // 首次失败，尝试协议拉起
          launchViaProtocol(scheme);
          log('等待桌面端启动 (' + DEFAULTS.launchWaitMs + 'ms)...');
          return new Promise(function (resolve) {
            setTimeout(function () {
              resolve(detectAndLaunch(retries + 1));
            }, DEFAULTS.launchWaitMs);
          });
        } else if (retries < DEFAULTS.maxRetries) {
          // 后续重试
          log('重试检测...');
          return new Promise(function (resolve) {
            setTimeout(function () {
              resolve(detectAndLaunch(retries + 1));
            }, DEFAULTS.retryInterval);
          });
        } else {
          log('桌面端未检测到，请手动启动智医助理');
          return false;
        }
      });
  }

  function bootstrap() {
    detectAndLaunch()
      .then(function (online) {
        if (!sdkUrl) {
          log('未配置 data-sdk-url，跳过 SDK 加载。可通过 MedHermesLoader.getStatus() 查看状态。');
          fireReady(null);
          return;
        }

        return loadScript(sdkUrl).then(function () {
          state.sdkLoaded = true;

          // 查找全局 MedHermes 构造函数
          var MedHermesCtor = (typeof MedHermes !== 'undefined') ? MedHermes : null;
          if (!MedHermesCtor) {
            fireError(new Error('SDK 加载成功但 MedHermes 类未找到'));
            return;
          }

          if (!autoInit) {
            fireReady(null);
            return;
          }

          // 自动实例化并初始化
          var mh = new MedHermesCtor({ baseUrl: bridgeUrl, scheme: scheme });
          if (online) {
            mh.init()
              .then(function () { fireReady(mh); })
              .catch(function () {
                log('握手失败，实例仍可用（桌面端可能稍后启动）');
                fireReady(mh);
              });
          } else {
            // 桌面端不在线，实例仍然返回，HIS 可在稍后手动 init
            fireReady(mh);
          }
        });
      })
      .catch(function (err) {
        log('引导流程异常: ' + err.message);
        fireError(err);
      });
  }

  // ─── 公共 API ───

  function ensureInstance() {
    if (state.instance) {
      return Promise.resolve(state.instance);
    }

    return new Promise(function (resolve, reject) {
      MedHermesLoader.ready(function (instance) {
        if (instance) {
          resolve(instance);
        } else {
          reject(new Error('MedHermes SDK 尚未初始化'));
        }
      });
      MedHermesLoader.onError(reject);
    });
  }

  function callInstance(method, args) {
    return ensureInstance().then(function (instance) {
      if (!instance || typeof instance[method] !== 'function') {
        throw new Error('MedHermes method not found: ' + method);
      }
      return instance[method].apply(instance, args || []);
    });
  }

  var MedHermesLoader = {

    /**
     * SDK 就绪回调。如果已就绪则立即执行。
     * @param {Function} fn - 回调函数，参数为 MedHermes 实例（或 null）
     */
    ready: function (fn) {
      if (state.instance !== null || (state.sdkLoaded && !autoInit)) {
        try { fn(state.instance); } catch (e) { console.error(e); }
      } else {
        state.readyCallbacks.push(fn);
      }
    },

    /**
     * 错误回调
     * @param {Function} fn
     */
    onError: function (fn) {
      state.errorCallbacks.push(fn);
    },

    /**
     * 获取当前状态
     */
    getStatus: function () {
      return {
        online: state.online,
        sdkLoaded: state.sdkLoaded,
        instance: state.instance
      };
    },

    /**
     * 手动触发检测 + 拉起
     */
    detect: function () {
      return detectAndLaunch();
    },

    /**
     * 手动触发协议拉起
     */
    launch: function () {
      launchViaProtocol(scheme);
    },

    /**
     * 手动 ping 检测
     */
    ping: function () {
      return ping(bridgeUrl);
    },

    /**
     * 代理常用 SDK 方法，兼容 HIS 侧直接调用 MedHermesLoader.startConsultation(...)
     */
    startConsultation: function (patient) {
      return callInstance('startConsultation', [patient]);
    },

    assist: function (patient, action) {
      return callInstance('assist', [patient, action]);
    },

    startVoice: function (patient) {
      return callInstance('startVoice', [patient]);
    },

    interpretReport: function () {
      return callInstance('interpretReport', Array.prototype.slice.call(arguments));
    },

    generateInpatientEmr: function () {
      return callInstance('generateInpatientEmr', Array.prototype.slice.call(arguments));
    },

    receivePatient: function (patientId, optionalInfo) {
      return callInstance('receivePatient', [patientId, optionalInfo]);
    },

    sendRisks: function (patient, risks) {
      return callInstance('sendRisks', [patient, risks]);
    },

    sendFeedback: function (requestId, status, message, items) {
      return callInstance('sendFeedback', [requestId, status, message, items]);
    },

    stop: function () {
      return callInstance('stop', []);
    }
  };

  // 暴露全局
  window.MedHermesLoader = MedHermesLoader;

  // DOM Ready 后自动启动引导
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    // 用 setTimeout 确保 HIS 有机会先注册 ready 回调
    setTimeout(bootstrap, 0);
  }

})();
