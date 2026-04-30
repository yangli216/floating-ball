/**
 * MedHermes JS SDK v1.0.0
 * 智医助理 (MedHermes) 第三方 HIS 集成 SDK
 *
 * 零依赖、单文件，通过 <script> 标签或 ES Module 引入即可使用。
 * 封装全部本地 HTTP Bridge 接口 + 智能轮询 + 去重 + 协议拉起 + 浏览器上下文同步。
 *
 * @license MIT
 * @see https://github.com/yangli216/floating-ball
 */
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MedHermes = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SDK_VERSION = '1.0.0';

  // ─── 工具函数 ───

  function assign(target) {
    for (var i = 1; i < arguments.length; i++) {
      var source = arguments[i];
      if (source) {
        for (var key in source) {
          if (Object.prototype.hasOwnProperty.call(source, key)) {
            target[key] = source[key];
          }
        }
      }
    }
    return target;
  }

  function buildResultKey(result) {
    var record = result.record || result;
    return JSON.stringify({
      consultationId: result.consultationId || result.consultation_id || '',
      resultType: record.resultType || 'final-report',
      requestId: record.requestId || '',
      referenceStatus: record.referenceStatus || '',
      timestamp: result.timestamp || record.timestamp || 0
    });
  }

  // ─── 事件发射器 ───

  function EventEmitter() {
    this._listeners = {};
  }

  EventEmitter.prototype.on = function (event, fn) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
    return this;
  };

  EventEmitter.prototype.off = function (event, fn) {
    if (!this._listeners[event]) return this;
    if (!fn) {
      delete this._listeners[event];
      return this;
    }
    this._listeners[event] = this._listeners[event].filter(function (f) { return f !== fn; });
    return this;
  };

  EventEmitter.prototype.emit = function (event) {
    var args = Array.prototype.slice.call(arguments, 1);
    var listeners = this._listeners[event];
    if (listeners) {
      for (var i = 0; i < listeners.length; i++) {
        try { listeners[i].apply(null, args); } catch (e) { console.error('[MedHermes] Event handler error:', e); }
      }
    }
    return this;
  };

  // ─── HTTP 客户端 ───

  function HttpClient(baseUrl, timeout) {
    this.baseUrl = baseUrl;
    this.timeout = timeout || 5000;
  }

  HttpClient.prototype.post = function (path, payload) {
    var url = this.baseUrl + path;
    var timeoutMs = this.timeout;

    return new Promise(function (resolve, reject) {
      var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timer = setTimeout(function () {
        if (controller) controller.abort();
        reject(new Error('Request timeout'));
      }, timeoutMs);

      var opts = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload || {})
      };
      if (controller) opts.signal = controller.signal;

      fetch(url, opts)
        .then(function (res) {
          clearTimeout(timer);
          return res.text().then(function (text) {
            var body;
            try { body = text ? JSON.parse(text) : null; } catch (_) { body = text; }
            if (!res.ok) {
              var err = new Error(typeof body === 'string' ? body : JSON.stringify(body));
              err.status = res.status;
              err.body = body;
              throw err;
            }
            return body;
          });
        })
        .then(resolve)
        .catch(function (err) {
          clearTimeout(timer);
          reject(err);
        });
    });
  };

  HttpClient.prototype.get = function (path) {
    var url = this.baseUrl + path;
    var timeoutMs = this.timeout;

    return new Promise(function (resolve, reject) {
      var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timer = setTimeout(function () {
        if (controller) controller.abort();
        reject(new Error('Request timeout'));
      }, timeoutMs);

      var opts = {};
      if (controller) opts.signal = controller.signal;

      fetch(url, opts)
        .then(function (res) {
          clearTimeout(timer);
          return res.text().then(function (text) {
            var body;
            try { body = text ? JSON.parse(text) : null; } catch (_) { body = text; }
            if (!res.ok) {
              var err = new Error(typeof body === 'string' ? body : JSON.stringify(body));
              err.status = res.status;
              err.body = body;
              throw err;
            }
            return body;
          });
        })
        .then(resolve)
        .catch(function (err) {
          clearTimeout(timer);
          reject(err);
        });
    });
  };

  // ─── 协议拉起器 ───

  function Launcher(scheme) {
    this.scheme = scheme || 'med-hermes';
  }

  Launcher.prototype.launch = function (path, params) {
    var url = this.scheme + '://' + (path || 'launch');
    if (params) {
      try {
        url += '?data=' + encodeURIComponent(JSON.stringify(params));
      } catch (_) { /* ignore */ }
    }
    // 使用 iframe 方式触发协议，兼容性最佳
    var iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = url;
    document.body.appendChild(iframe);
    setTimeout(function () {
      try { document.body.removeChild(iframe); } catch (_) { /* ignore */ }
    }, 3000);
  };

  // ─── 浏览器上下文采集 ───

  function collectBrowserContext(extra) {
    return {
      origin: (function() {
        if (typeof location === 'undefined') return '';
        var origin = location.origin;
        var pathname = location.pathname;
        var contextPath = '';
        if (pathname && pathname.length > 1) {
          var segments = pathname.split('/');
          // 如果路径类似 /his-web/xxx，则提取 /his-web
          // 注意排除常见的前端路由或静态资源目录，如果有特定的应用名可以更精确匹配
          if (segments.length > 1 && segments[1] && segments[1].indexOf('.html') === -1) {
             contextPath = '/' + segments[1];
          }
        }
        return origin + contextPath;
      })(),
      href: typeof location !== 'undefined' ? location.href : '',
      cookie: typeof document !== 'undefined' ? document.cookie : '',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      timestamp: Date.now(),
      sdkVersion: SDK_VERSION,
      extra: extra || {}
    };
  }

  function buildHandshakeContext(baseCtx, overrides) {
    var payload = assign({}, baseCtx || {}, overrides || {});
    var baseExtra = (baseCtx && baseCtx.extra && typeof baseCtx.extra === 'object') ? baseCtx.extra : {};
    var overrideExtra = (overrides && overrides.extra && typeof overrides.extra === 'object') ? overrides.extra : {};

    payload.extra = assign({}, baseExtra, overrideExtra);
    payload.timestamp = Date.now();
    return payload;
  }

  // ─── 主类 ───

  /**
   * MedHermes SDK 主类
   *
   * @param {Object} [options]
   * @param {string} [options.baseUrl='http://127.0.0.1:8081/api'] 本地桥接地址
   * @param {number} [options.pollInterval=2000] 轮询间隔（毫秒）
   * @param {boolean} [options.autoPoll=true] 业务调用后是否自动轮询
   * @param {string} [options.scheme='med-hermes'] 深度链接协议名
   * @param {number} [options.launchRetryMs=3000] 协议拉起后等待重连时间
   * @param {number} [options.timeout=5000] HTTP 请求超时时间
   * @param {Object} [options.extra] 自定义浏览器上下文扩展字段
   */
  function MedHermes(options) {
    var opts = assign({
      baseUrl: 'http://127.0.0.1:8081/api',
      pollInterval: 2000,
      autoPoll: true,
      scheme: 'med-hermes',
      launchRetryMs: 3000,
      timeout: 20000,
      extra: {}
    }, options);

    this._opts = opts;
    this._http = new HttpClient(opts.baseUrl, opts.timeout);
    this._launcher = new Launcher(opts.scheme);
    this._emitter = new EventEmitter();
    this._pollTimer = null;
    this._lastResultKey = '';
    this._connected = false;
    this._destroyed = false;
    this._browserCtx = null;
    this._currentPatientId = null;
  }

  // 代理事件方法
  MedHermes.prototype.on = function (event, fn) { this._emitter.on(event, fn); return this; };
  MedHermes.prototype.off = function (event, fn) { this._emitter.off(event, fn); return this; };

  /**
   * 初始化 SDK：采集浏览器上下文 + 与桌面端握手
   * 如果桌面端不在线，会尝试通过协议拉起
   *
   * @returns {Promise<Object>} 握手结果
   */
  MedHermes.prototype.init = function (extra) {
    var self = this;

    // 先尝试获取 HIS 上下文，然后再执行握手
    return this._collectHISContext(extra)
      .then(function (finalExtra) {
        self._browserCtx = collectBrowserContext(finalExtra);
        return self._handshake();
      })
      .then(function (result) {
        self._connected = true;
        self._emitter.emit('connected', result);
        return result;
      })
      .catch(function (err) {
        // 如果是 HIS 接口报错但不是连接报错，记录一下但继续尝试握手（除非是因为桌面端没启动）
        if (err && err.message && err.message.indexOf('MedHermes') === -1) {
          console.warn('[MedHermes] HIS context collection failed:', err);
        }

        // 桌面端不在线，尝试协议拉起
        self._emitter.emit('launching');
        self._launcher.launch('launch');

        return new Promise(function (resolve, reject) {
          setTimeout(function () {
            self._handshake()
              .then(function (result) {
                self._connected = true;
                self._emitter.emit('connected', result);
                resolve(result);
              })
              .catch(function () {
                self._connected = false;
                self._emitter.emit('launch-failed');
                reject(new Error('MedHermes 桌面端未启动，协议拉起失败'));
              });
          }, self._opts.launchRetryMs);
        });
      });
  };

  /**
   * 异步采集 HIS 特定上下文 (emrAccessToken, urt)
   * @private
   */
  MedHermes.prototype._collectHISContext = function (extra) {
    var self = this;
    var finalExtra = assign({}, this._opts.extra, extra);

    // 1. 获取 urt (同步)
    try {
      if (typeof $env !== 'undefined' && $env.globalContext && typeof $env.globalContext.get === 'function') {
        var urt = $env.globalContext.get('urt');
        if (urt) {
          finalExtra.urt = urt;
        }
      }
    } catch (e) {
      console.warn('[MedHermes] Failed to get urt from $env:', e);
    }

    // 2. 获取 accessToken (异步)
    if (typeof $ajax === 'function') {
      return new Promise(function (resolve) {
        try {
          $ajax({
            method: "POST",
            url: "api/base.publicService/emrAccessToken",
            timeout: 5000,
            jsonData: {}
          }).then(function (res) {
            if (res && res.body) {
              finalExtra.emrAccessToken = res.body;
              finalExtra.accessToken = res.body; // 兼容性字段
            }
            resolve(finalExtra);
          }).catch(function (err) {
            console.warn('[MedHermes] $ajax emrAccessToken failed:', err);
            resolve(finalExtra); // 报错也继续，不阻塞握手
          });
        } catch (e) {
          console.warn('[MedHermes] Error calling $ajax:', e);
          resolve(finalExtra);
        }
      });
    }

    return Promise.resolve(finalExtra);
  };

  /** 内部握手方法 */
  MedHermes.prototype._handshake = function () {
    var ctx = this._browserCtx || collectBrowserContext(this._opts.extra);
    return this._http.post('/handshake', ctx);
  };

  /**
   * 调试模式：手动覆盖握手入参。
   * 常用于联调页或非真实 HIS 环境下手动传入 emrAccessToken。
   * @param {Object} [overrides] 可覆盖 origin/href/cookie/userAgent/extra 等字段
   * @returns {Promise<Object>} 握手结果
   */
  MedHermes.prototype.debugHandshake = function (overrides) {
    this._browserCtx = buildHandshakeContext(
      this._browserCtx || collectBrowserContext(this._opts.extra),
      overrides
    );

    var self = this;
    return this._handshake().then(function (result) {
      self._connected = true;
      self._emitter.emit('connected', result);
      return result;
    });
  };

  /**
   * 检测 MedHermes 桌面端是否在线
   * @returns {Promise<Object>} 包含版本号等信息
   */
  MedHermes.prototype.ping = function () {
    return this._http.get('/health');
  };

  /**
   * 启动完整问诊
   * @param {Object} patient 患者信息（必须包含 idPi, naPi, sdSexText, ageText）
   * @returns {Promise<Object>}
   */
  MedHermes.prototype.startConsultation = function (patient) {
    var self = this;
    this._currentPatientId = patient.idPi || patient.patientId || '';
    this._lastResultKey = '';

    return this._callWithFallback(
      function () { return self._http.post('/consultation/start', patient); },
      'start-consultation',
      patient
    ).then(function (result) {
      if (self._opts.autoPoll) self.startPolling();
      return result;
    });
  };

  /**
   * 灵活模式：直接进入指定 AI 模块
   * @param {Object} patient 患者信息
   * @param {string} action 动作类型: record/diagnosis/differential/medication/examination/lab_test/procedure/reminder
   * @returns {Promise<Object>}
   */
  MedHermes.prototype.assist = function (patient, action) {
    var self = this;
    var payload = assign({}, patient, { action: action });
    this._currentPatientId = patient.idPi || patient.patientId || '';
    this._lastResultKey = '';

    return this._callWithFallback(
      function () { return self._http.post('/consultation/assist', payload); },
      'assist',
      payload
    ).then(function (result) {
      if (self._opts.autoPoll) self.startPolling();
      return result;
    });
  };

  /**
   * 启动语音问诊
   * @param {Object} [patient] 患者信息（可选，不传则沿用桌面端当前上下文）
   * @returns {Promise<Object>}
   */
  MedHermes.prototype.startVoice = function (patient) {
    var self = this;
    if (patient) {
      this._currentPatientId = patient.idPi || patient.patientId || '';
    }
    this._lastResultKey = '';

    return this._callWithFallback(
      function () { return self._http.post('/consultation/start-voice', patient || {}); },
      'voice-consultation',
      patient
    ).then(function (result) {
      if (self._opts.autoPoll) self.startPolling();
      return result;
    });
  };

  /**
   * 结束当前接诊
   * @returns {Promise<Object>}
   */
  MedHermes.prototype.stop = function () {
    this.stopPolling();
    this._currentPatientId = null;
    return this._http.post('/consultation/stop', {});
  };

  /**
   * 接收患者接诊
   * @param {string} patientId 患者 ID
   * @param {Object} [optionalInfo] 可选辅助信息
   * @returns {Promise<Object>}
   */
  MedHermes.prototype.receivePatient = function (patientId, optionalInfo) {
    var self = this;
    var payload = assign({ idPi: patientId }, optionalInfo || {});
    this._currentPatientId = patientId || '';
    this._lastResultKey = '';

    return this._callWithFallback(
      function () { return self._http.post('/consultation/receive', payload); },
      'receive-patient',
      payload
    ).then(function (result) {
      if (self._opts.autoPoll) self.startPolling();
      return result;
    });
  };

  /**
   * 推送患者风险信息
   * @param {Object} patient 患者信息
   * @param {Array} [risks] 预计算风险项（不传则由 LLM 自动分析）
   * @returns {Promise<Object>}
   */
  MedHermes.prototype.sendRisks = function (patient, risks) {
    var payload = assign({}, patient);
    if (risks) payload.risks = risks;
    return this._http.post('/patient/risks', payload);
  };

  /**
   * 发送 PHIS 引用回执
   * @param {string} requestId 对应 reference-request 中的 requestId
   * @param {string} status 'success' 或 'failed'
   * @param {string} [message] 成功说明或失败原因
   * @param {Array} [items] 实际保存的项目列表
   * @returns {Promise<Object>}
   */
  MedHermes.prototype.sendFeedback = function (requestId, status, message, items) {
    var self = this;
    var payload = {
      consultationId: this._currentPatientId || '',
      requestId: requestId,
      referenceType: 'batch',
      action: 'batch',
      status: status,
      message: message || (status === 'success' ? 'PHIS 保存成功' : 'PHIS 保存失败'),
      items: items || []
    };

    return this._http.post('/consultation/reference-feedback', payload)
      .then(function (result) {
        if (self._opts.autoPoll) self.startPolling();
        return result;
      });
  };

  /**
   * 手动拉取一次结果
   * @returns {Promise<Object|null>} 结果对象，或 null（无结果）
   */
  MedHermes.prototype.fetchResult = function () {
    var self = this;
    return this._http.get('/consultation/result')
      .then(function (result) {
        if (result && result.status === 'pending') {
          return null; // 尚未就绪
        }
        // 检测 cancelled 状态：桌面端已经终止了接诊
        var record = result && (result.record || result);
        var resultType = record && record.resultType;
        if (result && (result.status === 'cancelled' || resultType === 'cancelled')) {
          self.stopPolling();
          var cancelErr = new Error(record.reason || 'Consultation cancelled by user');
          cancelErr.code = 'CANCELLED';
          cancelErr.result = result;
          self._emitter.emit('cancelled', result);
          self._emitter.emit('error', cancelErr);
          throw cancelErr;
        }
        self._processResult(result);
        return result;
      })
      .catch(function (err) {
        if (err.code === 'CANCELLED') throw err; // 不吞掉 cancelled 异常
        if (err.status === 404) return null; // 兼容旧版
        self._emitter.emit('error', err);
        throw err;
      });
  };

  /** 启动自动轮询（长轮询模式） */
  MedHermes.prototype.startPolling = function () {
    if (this._destroyed || this._isPolling) return;
    var self = this;
    this._isPolling = true;
    this._emitter.emit('polling-start');

    function poll() {
      if (!self._isPolling || self._destroyed) return;

      self.fetchResult()
        .then(function (result) {
          // 如果拿到了结果（非 reference-request），fetchResult 内部会停止轮询
          // 如果是 reference-request，继续下一次长轮询
          if (self._isPolling) {
            setTimeout(poll, 100); // 稍微延迟，避免极端情况下的死循环
          }
        })
        .catch(function (err) {
          // cancelled 异常：立即停止，不再重试
          if (err.code === 'CANCELLED') return;
          // 404 或超时都继续轮询
          if (self._isPolling) {
            setTimeout(poll, self._opts.pollInterval || 2000);
          }
        });
    }

    poll();
  };

  /** 停止自动轮询 */
  MedHermes.prototype.stopPolling = function () {
    this._isPolling = false;
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
    this._emitter.emit('polling-stop');
  };

  /** 销毁实例，清理全部资源 */
  MedHermes.prototype.destroy = function () {
    this._destroyed = true;
    this.stopPolling();
    this._emitter = new EventEmitter(); // 清空所有监听
    this._connected = false;
  };

  // ─── 内部方法 ───

  /** HTTP 调用 + 离线协议拉起兜底 */
  MedHermes.prototype._callWithFallback = function (httpCall, protocolPath, params) {
    var self = this;
    
    // 静默执行一次握手，确保小球端上下文（如 Token）是最新的，以应对小球可能刚刚重启的情况。
    // 如果握手失败，我们忽略异常（catch），继续走后面的请求和兜底逻辑。
    var ensureHandshake = this._handshake().catch(function() {});

    return ensureHandshake.then(function() {
      return httpCall().catch(function (err) {
        // 网络失败（桌面端可能不在线），尝试协议拉起
        if (err.message === 'Request timeout' || err.message === 'Failed to fetch' || !err.status) {
          self._emitter.emit('launching');
          self._launcher.launch(protocolPath, params);

          return new Promise(function (resolve, reject) {
            setTimeout(function () {
              // 拉起后重试前，同样先做一次静默握手
              self._handshake().catch(function() {}).then(function() {
                httpCall()
                  .then(resolve)
                  .catch(function () {
                    var offlineErr = new Error('MedHermes 桌面端未启动');
                    offlineErr.code = 'OFFLINE';
                    self._emitter.emit('launch-failed');
                    self._emitter.emit('error', offlineErr);
                    reject(offlineErr);
                  });
              });
            }, self._opts.launchRetryMs);
          });
        }
        // 其他 HTTP 错误直接抛出
        self._emitter.emit('error', err);
        throw err;
      });
    });
  };

  /** 处理轮询到的结果：去重 + 分发事件 */
  MedHermes.prototype._processResult = function (result) {
    if (!result) return;

    // 患者校验
    var consultationId = String(result.consultationId || result.consultation_id || '');
    if (this._currentPatientId && consultationId && consultationId !== String(this._currentPatientId)) {
      return; // 忽略非当前患者的结果
    }

    // 去重
    var key = buildResultKey(result);
    if (key === this._lastResultKey) return;
    this._lastResultKey = key;

    // 提取 record
    var record = result.record || result;
    var resultType = record.resultType || 'final-report';

    // 分发事件
    this._emitter.emit(resultType, record);

    // 自动停止轮询（除非是 reference-request，需要继续等待回执）
    if (resultType !== 'reference-request') {
      this.stopPolling();
    }
  };

  // 暴露版本号
  MedHermes.VERSION = SDK_VERSION;

  return MedHermes;
});
