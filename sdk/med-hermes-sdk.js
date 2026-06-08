/**
 * MedHermes JS SDK v2.0.0
 * 智医助理 (MedHermes) 第三方 HIS 集成 SDK
 *
 * 零依赖、单文件，通过 <script> 标签或 ES Module 引入即可使用。
 * 封装全部本地 HTTP Bridge 接口 + 事件长轮询 + 订阅分发 + 协议拉起 + 浏览器上下文同步。
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

  var SDK_VERSION = '2.0.0';

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

  var STREAM_EVENT_NAMES = {
    event: true,
    draft: true,
    'final-report': true,
    batch: true,
    'record-confirmed': true,
    'reference-request': true,
    'reference-feedback': true,
    cancelled: true
  };

  function buildEventKey(result) {
    var envelope = normalizeEventEnvelope(result);
    var event = envelope && envelope.event ? envelope.event : {};
    var payload = event.payload || {};
    return JSON.stringify({
      id: event.id || '',
      consultationId: event.consultationId || '',
      eventType: event.type || payload.resultType || '',
      requestId: event.requestId || payload.requestId || '',
      referenceStatus: payload.referenceStatus || '',
      timestamp: event.timestamp || 0
    });
  }

  function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function normalizeEventPayload(payload) {
    return isPlainObject(payload) ? assign({}, payload) : {};
  }

  function normalizeConsultationEvent(event) {
    if (!isPlainObject(event)) return null;

    var payload = normalizeEventPayload(event.payload);
    var consultationId = event.consultationId || payload.consultationId || payload.consultation_id || '';
    var requestId = event.requestId || payload.requestId || '';
    var type = event.type || payload.resultType || null;
    var timestamp = event.timestamp || payload.timestamp || Date.now();

    return {
      id: event.id || [consultationId || '-', requestId || '-', type || '-', timestamp].join(':'),
      type: type,
      consultationId: consultationId,
      requestId: requestId || null,
      timestamp: timestamp,
      terminal: event.terminal !== false,
      payload: payload
    };
  }

  function normalizeEventEnvelope(result) {
    if (!isPlainObject(result)) return null;

    var event = normalizeConsultationEvent(result.event);
    var state = typeof result.state === 'string' && result.state
      ? result.state
      : (event && event.type === 'cancelled' ? 'cancelled' : event ? 'ready' : 'pending');

    return {
      state: state,
      traceId: typeof result.traceId === 'string' ? result.traceId : '',
      code: typeof result.code === 'string' ? result.code : '',
      message: typeof result.message === 'string' ? result.message : '',
      event: event
    };
  }

  function buildEventWebSocketUrl(baseUrl, lastEventId) {
    var url = String(baseUrl || 'http://127.0.0.1:8081/api').replace(/\/+$/, '');
    url = url.replace(/^https:/i, 'wss:').replace(/^http:/i, 'ws:');
    url += '/consultation/events/ws';
    if (lastEventId) {
      url += '?after=' + encodeURIComponent(lastEventId);
    }
    return url;
  }

  function getPatientId(patient) {
    return patient && (patient.idPi || patient.patientId) || '';
  }

  function getPatientAnchorId(patient) {
    return patient && (patient.idVis || patient.visitId || patient.idPi || patient.patientId) || '';
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

  EventEmitter.prototype.hasAnyListeners = function (eventMap) {
    for (var event in eventMap) {
      if (!Object.prototype.hasOwnProperty.call(eventMap, event)) continue;
      if (this._listeners[event] && this._listeners[event].length > 0) return true;
    }
    return false;
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
  * @param {'auto'|'websocket'|'polling'} [options.eventTransport='auto'] 事件通道策略
  * @param {number} [options.wsReconnectMs=1000] WebSocket 断线重连间隔
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
      eventTransport: 'auto',
      wsReconnectMs: 1000,
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
    this._ws = null;
    this._wsReconnectTimer = null;
    this._isPolling = false;
    this._isChannelPersistent = false;
    this._isWsConnecting = false;
    this._transport = 'idle';
    this._lastResultKey = '';
    this._lastEventId = '';
    this._connected = false;
    this._destroyed = false;
    this._browserCtx = null;
    this._currentPatientId = null;
    this._currentConsultationId = null;
    this._lastEventConsultationId = null;
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
        self._isChannelPersistent = true;
        self._ensureInteractionChannel();
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
                self._isChannelPersistent = true;
                self._ensureInteractionChannel();
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
      self._isChannelPersistent = true;
      self._ensureInteractionChannel();
      self._emitter.emit('connected', result);
      return result;
    });
  };

  MedHermes.prototype._resumePollingIfNeeded = function () {
    this._ensureInteractionChannel();
    if (this._opts.autoPoll || this._emitter.hasAnyListeners(STREAM_EVENT_NAMES)) {
      this.startPolling();
    }
  };

  MedHermes.prototype._ensureInteractionChannel = function () {
    if (this._destroyed || !this._connected) return;

    if (this._shouldUseWebSocket()) {
      this._openPersistentWebSocket();
      return;
    }

    if (this._isPolling) {
      this._startLongPollingEvents();
    }
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
    this._currentPatientId = getPatientId(patient);
    this._currentConsultationId = getPatientAnchorId(patient);
    this._lastResultKey = '';
    this._lastEventId = '';
    this._lastEventConsultationId = null;

    return this._callWithFallback(
      function () { return self._http.post('/consultation/start', patient); },
      'start-consultation',
      patient
    ).then(function (result) {
      self._resumePollingIfNeeded();
      return result;
    });
  };

  /**
   * 灵活模式：直接进入指定 AI 模块
   * @param {Object} patient 患者信息
   * @param {string} action 动作类型: record/suggestedDx/diffDx/diagnosis/differential/medication/examination/lab_test/procedure/treatment_plan/reminder
   * @returns {Promise<Object>}
   */
  MedHermes.prototype.assist = function (patient, action) {
    var self = this;
    var payload = assign({}, patient, { action: action });
    this._currentPatientId = getPatientId(patient);
    this._currentConsultationId = getPatientAnchorId(patient);
    this._lastResultKey = '';
    this._lastEventId = '';
    this._lastEventConsultationId = null;

    return this._callWithFallback(
      function () { return self._http.post('/consultation/assist', payload); },
      'assist',
      payload
    ).then(function (result) {
      self._resumePollingIfNeeded();
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
      this._currentPatientId = getPatientId(patient);
      this._currentConsultationId = getPatientAnchorId(patient);
    }
    this._lastResultKey = '';
    this._lastEventId = '';
    this._lastEventConsultationId = null;

    return this._callWithFallback(
      function () { return self._http.post('/consultation/start-voice', patient || {}); },
      'voice-consultation',
      patient
    ).then(function (result) {
      self._resumePollingIfNeeded();
      return result;
    });
  };

  /**
   * 触发检验/检查报告解读
   * @param {Object|string} request 报告解读请求对象，或 taskId
   * @param {string} [query] 报告原文（仅当第一个参数是 taskId 时使用）
   * @param {Object} [patient] 可选患者信息
   * @returns {Promise<Object>}
   */
  MedHermes.prototype.interpretReport = function (request, query, patient) {
    var self = this;
    var payload = (request && typeof request === 'object' && !Array.isArray(request))
      ? assign({}, request)
      : {
          taskId: request,
          query: query,
          patient: patient
        };

    if (!payload || !payload.taskId || !payload.query) {
      return Promise.reject(new Error('interpretReport 缺少 taskId 或 query'));
    }

    return this._callWithFallback(
      function () { return self._http.post('/report/interpret', payload); },
      'report-interpret',
      payload
    );
  };

  /**
   * 触发住院病历辅助生成
   * @param {Object|string} request 住院病历生成请求对象，或 admissionId
   * @param {string} [htmlContent] EMR 模板 htmlContent（仅当第一个参数是 admissionId 时使用）
   * @param {Object} [options] 可选扩展，如 templateName/requestId/patient
   * @returns {Promise<Object>}
   */
  MedHermes.prototype.generateInpatientEmr = function (request, htmlContent, options) {
    var self = this;
    var payload = (request && typeof request === 'object' && !Array.isArray(request))
      ? assign({}, request)
      : assign({}, options || {}, {
          admissionId: request,
          htmlContent: htmlContent
        });

    if (!payload || !payload.admissionId || !payload.templateName || !payload.htmlContent) {
      return Promise.reject(new Error('generateInpatientEmr 缺少 admissionId、templateName 或 htmlContent'));
    }

    this._currentPatientId = payload.admissionId;
    this._currentConsultationId = payload.admissionId;
    this._lastResultKey = '';
    this._lastEventId = '';
    this._lastEventConsultationId = null;

    return this._callWithFallback(
      function () { return self._http.post('/inpatient/emr/generate', payload); },
      'inpatient-emr-generate',
      payload
    ).then(function (result) {
      self._resumePollingIfNeeded();
      return result;
    });
  };

  /**
   * 结束当前接诊
   * @returns {Promise<Object>}
   */
  MedHermes.prototype.stop = function () {
    var self = this;
    this.stopPolling();
    this._currentPatientId = null;
    this._currentConsultationId = null;
    this._lastEventConsultationId = null;
    return this._callWithFallback(
      function () { return self._http.post('/consultation/stop', {}); },
      'stop-consultation',
      {}
    )
      .then(function (result) {
        self._resumePollingIfNeeded();
        return result;
      });
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
    this._currentPatientId = getPatientId(payload);
    this._currentConsultationId = getPatientAnchorId(payload);
    this._lastResultKey = '';
    this._lastEventId = '';
    this._lastEventConsultationId = null;

    return this._callWithFallback(
      function () { return self._http.post('/consultation/receive', payload); },
      'receive-patient',
      payload
    ).then(function (result) {
      self._resumePollingIfNeeded();
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
    var self = this;
    var payload = assign({}, patient);
    if (risks) payload.risks = risks;
    return this._callWithFallback(
      function () { return self._http.post('/patient/risks', payload); },
      'patient-risks',
      payload
    );
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
      consultationId: this._lastEventConsultationId || this._currentConsultationId || this._currentPatientId || '',
      requestId: requestId,
      referenceType: 'batch',
      action: 'batch',
      status: status,
      message: message || (status === 'success' ? 'PHIS 保存成功' : 'PHIS 保存失败'),
      items: items || []
    };

    return this._callWithFallback(
      function () { return self._http.post('/consultation/reference-feedback', payload); },
      'reference-feedback',
      payload
    )
      .then(function (result) {
        self._resumePollingIfNeeded();
        return result;
      });
  };

  /**
   * 手动长轮询一次事件
   * @returns {Promise<Object|null>} 事件 envelope，或 null（当前无事件）
   */
  MedHermes.prototype.pollEvent = function () {
    var self = this;
    var path = '/consultation/events/poll';
    if (this._lastEventId) {
      path += '?after=' + encodeURIComponent(this._lastEventId);
    }

    return this._http.get(path)
      .then(function (result) {
        var normalized = normalizeEventEnvelope(result);

        if (!normalized || normalized.state === 'pending' || !normalized.event) {
          return null; // 尚未就绪
        }

        // 检测 cancelled 状态：桌面端已经终止了接诊
        var event = normalized.event;
        var record = event.payload || {};
        if (normalized.state === 'cancelled' || event.type === 'cancelled') {
          self._lastEventId = event.id || self._lastEventId;
          var cancelErr = new Error(record.reason || 'Consultation cancelled by user');
          cancelErr.code = 'CANCELLED';
          cancelErr.result = normalized;
          self._emitter.emit('cancelled', normalized);
          self._emitter.emit('error', cancelErr);
          throw cancelErr;
        }
        self._dispatchEnvelope(normalized);
        return normalized;
      })
      .catch(function (err) {
        if (err.code === 'CANCELLED') throw err; // 不吞掉 cancelled 异常
        self._emitter.emit('error', err);
        throw err;
      });
  };

  /**
   * 订阅事件流；返回取消订阅函数
   * @param {Function} listener
   * @returns {Function}
   */
  MedHermes.prototype.subscribe = function (listener) {
    var self = this;
    if (typeof listener !== 'function') {
      throw new TypeError('subscribe requires a function listener');
    }

    this.on('event', listener);
    this.startPolling();

    return function unsubscribe() {
      self.off('event', listener);
      if (!self._emitter.hasAnyListeners(STREAM_EVENT_NAMES)) {
        self.stopPolling();
      }
    };
  };

  /** 启动事件消费；WebSocket 通道本身由 init/handshake 维持常驻 */
  MedHermes.prototype.startPolling = function () {
    if (this._destroyed || this._isPolling) return;
    this._isPolling = true;
    this._emitter.emit('subscription-start');

    this._ensureInteractionChannel();
    if (!this._shouldUseWebSocket()) {
      this._startLongPollingEvents();
    }
  };

  MedHermes.prototype._shouldUseWebSocket = function () {
    return this._opts.eventTransport !== 'polling'
      && typeof WebSocket !== 'undefined';
  };

  MedHermes.prototype._openPersistentWebSocket = function () {
    if (this._destroyed || !this._connected || !this._isChannelPersistent) return;
    if (this._ws || this._isWsConnecting) return;

    var self = this;
    var opened = false;
    this._isWsConnecting = true;
    this._transport = 'websocket';

    try {
      var ws = new WebSocket(buildEventWebSocketUrl(this._opts.baseUrl, this._lastEventId));
      this._ws = ws;

      ws.onopen = function () {
        opened = true;
        self._isWsConnecting = false;
        self._emitter.emit('subscription-transport', { transport: 'websocket', state: 'connected' });
      };

      ws.onmessage = function (message) {
        if (!message || typeof message.data !== 'string' || message.data === 'pong') return;

        var parsed;
        try {
          parsed = JSON.parse(message.data);
        } catch (e) {
          console.warn('[MedHermes] Invalid WebSocket event payload:', message.data);
          return;
        }

        var envelope = normalizeEventEnvelope(parsed);
        if (!envelope || envelope.state === 'pending' || !envelope.event) return;

        var event = envelope.event;
        var record = event.payload || {};
        if (envelope.state === 'cancelled' || event.type === 'cancelled') {
          self._lastEventId = event.id || self._lastEventId;
          var cancelErr = new Error(record.reason || 'Consultation cancelled by user');
          cancelErr.code = 'CANCELLED';
          cancelErr.result = envelope;
          self._emitter.emit('cancelled', envelope);
          self._emitter.emit('error', cancelErr);
          return;
        }

        self._dispatchEnvelope(envelope);
      };

      ws.onerror = function () {
        self._isWsConnecting = false;
        self._emitter.emit('subscription-transport', { transport: 'websocket', state: 'error' });
      };

      ws.onclose = function () {
        self._isWsConnecting = false;
        if (self._ws === ws) self._ws = null;
        if (self._destroyed || !self._connected || !self._isChannelPersistent) return;

        self._emitter.emit('subscription-transport', { transport: 'websocket', state: 'closed' });
        if (!opened && self._opts.eventTransport !== 'websocket') {
          if (self._isPolling) {
            self._startLongPollingEvents();
          }
          return;
        }

        self._wsReconnectTimer = setTimeout(function () {
          self._openPersistentWebSocket();
        }, self._opts.wsReconnectMs || 1000);
      };
    } catch (err) {
      this._isWsConnecting = false;
      this._emitter.emit('error', err);
      if (this._opts.eventTransport === 'websocket') {
        this._wsReconnectTimer = setTimeout(function () {
          self._openPersistentWebSocket();
        }, this._opts.wsReconnectMs || 1000);
      } else {
        if (this._isPolling) {
          this._startLongPollingEvents();
        }
      }
    }
  };

  MedHermes.prototype._startLongPollingEvents = function () {
    if (!this._isPolling || this._destroyed) return;
    if (this._shouldUseWebSocket() && this._ws) return;
    var self = this;
    this._transport = 'polling';
    this._emitter.emit('subscription-transport', { transport: 'polling', state: 'connected' });

    function poll() {
      if (!self._isPolling || self._destroyed) return;

      self.pollEvent()
        .then(function (result) {
          // 如果拿到了非终态结果，继续下一次长轮询；终态在 _processResult 中会停止。
          if (self._isPolling) {
            setTimeout(poll, 100); // 稍微延迟，避免极端情况下的死循环
          }
        })
        .catch(function (err) {
          // cancelled 只代表某次业务流结束，不影响长寿命交互通道
          if (err.code === 'CANCELLED') {
            if (self._isPolling && !self._ws) {
              setTimeout(poll, self._opts.pollInterval || 2000);
            }
            return;
          }
          // 404 或超时都继续轮询
          if (self._isPolling) {
            setTimeout(poll, self._opts.pollInterval || 2000);
          }
        });
    }

    poll();
  };

  /** 停止事件消费；不会关闭已建立的持久 WebSocket 通道 */
  MedHermes.prototype.stopPolling = function () {
    this._isPolling = false;
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
    if (!this._ws) {
      this._transport = 'idle';
    }
    this._emitter.emit('subscription-stop');
  };

  /** 销毁实例，清理全部资源 */
  MedHermes.prototype.destroy = function () {
    this._destroyed = true;
    this._isChannelPersistent = false;
    this.stopPolling();
    if (this._wsReconnectTimer) {
      clearTimeout(this._wsReconnectTimer);
      this._wsReconnectTimer = null;
    }
    if (this._ws) {
      try { this._ws.close(); } catch (e) {}
      this._ws = null;
    }
    this._emitter = new EventEmitter(); // 清空所有监听
    this._connected = false;
    this._transport = 'idle';
  };

  // ─── 内部方法 ───

  /** HTTP 调用 + 离线协议拉起兜底 */
  MedHermes.prototype._callWithFallback = function (httpCall, protocolPath, params) {
    var self = this;
    
    // 静默执行一次握手，确保小球端上下文（如 Token）是最新的，以应对小球可能刚刚重启的情况。
    // 如果握手失败，我们忽略异常（catch），继续走后面的请求和兜底逻辑。
    var ensureHandshake = this._handshake().then(function(result) {
      self._connected = true;
      self._isChannelPersistent = true;
      self._ensureInteractionChannel();
      return result;
    }).catch(function() {});

    return ensureHandshake.then(function() {
      return httpCall().catch(function (err) {
        // 网络失败（桌面端可能不在线），尝试协议拉起
        if (err.message === 'Request timeout' || err.message === 'Failed to fetch' || !err.status) {
          self._emitter.emit('launching');
          self._launcher.launch(protocolPath, params);

          return new Promise(function (resolve, reject) {
            setTimeout(function () {
              // 拉起后重试前，同样先做一次静默握手
              self._handshake().then(function(result) {
                self._connected = true;
                self._isChannelPersistent = true;
                self._ensureInteractionChannel();
                return result;
              }).catch(function() {}).then(function() {
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
        if (err.status === 401) {
          return self._handshake().then(function(result) {
            self._connected = true;
            self._isChannelPersistent = true;
            self._ensureInteractionChannel();
            return httpCall();
          }).catch(function(refreshErr) {
            self._emitter.emit('error', refreshErr);
            throw err;
          });
        }
        // 其他 HTTP 错误直接抛出
        self._emitter.emit('error', err);
        throw err;
      });
    });
  };

  /** 处理轮询到的事件：去重 + 分发事件 */
  MedHermes.prototype._dispatchEnvelope = function (envelope) {
    if (!envelope || !envelope.event) return;

    // 患者校验
    var consultationId = String(envelope.event.consultationId || '');
    var currentPatientId = String(this._currentPatientId || '');
    var currentConsultationId = String(this._currentConsultationId || '');
    if (
      consultationId
      && currentPatientId
      && currentConsultationId
      && consultationId !== currentPatientId
      && consultationId !== currentConsultationId
    ) {
      return; // 忽略非当前患者/就诊的结果
    }
    if (
      consultationId
      && currentPatientId
      && !currentConsultationId
      && consultationId !== currentPatientId
    ) {
      return; // 忽略非当前患者的结果
    }

    // 去重
    var key = buildEventKey(envelope);
    if (key === this._lastResultKey) return;
    this._lastResultKey = key;

    var event = envelope.event;
    var record = event.payload || {};
    var resultType = event.type || record.resultType || 'final-report';

    // 分发通用 envelope 事件 + 按业务类型分发 payload
    this._lastEventId = event.id || '';
    this._lastEventConsultationId = consultationId || this._lastEventConsultationId;
    this._emitter.emit('event', envelope);
    this._emitter.emit(resultType, record);

  };

  // 暴露版本号
  MedHermes.VERSION = SDK_VERSION;

  function ensureFallbackLoader() {
    var host = typeof globalThis !== 'undefined'
      ? globalThis
      : (typeof window !== 'undefined' ? window : null);
    if (!host || host.MedHermesLoader) return;

    var loaderState = {
      instance: null,
      initPromise: null,
      readyCallbacks: [],
      errorCallbacks: []
    };

    function getInstance() {
      if (!loaderState.instance) {
        loaderState.instance = new MedHermes();
      }
      return loaderState.instance;
    }

    function fireReady(instance) {
      var callbacks = loaderState.readyCallbacks.slice();
      loaderState.readyCallbacks.length = 0;
      for (var i = 0; i < callbacks.length; i++) {
        try { callbacks[i](instance); } catch (e) { console.error(e); }
      }
    }

    function fireError(err) {
      for (var i = 0; i < loaderState.errorCallbacks.length; i++) {
        try { loaderState.errorCallbacks[i](err); } catch (e) { console.error(e); }
      }
    }

    function ensureReady(extra) {
      var instance = getInstance();
      if (loaderState.initPromise) return loaderState.initPromise;

      loaderState.initPromise = instance.init(extra)
        .catch(function (err) {
          fireError(err);
          return instance;
        })
        .then(function () {
          fireReady(instance);
          return instance;
        });
      return loaderState.initPromise;
    }

    function call(method, args) {
      return ensureReady().then(function (instance) {
        if (!instance || typeof instance[method] !== 'function') {
          throw new Error('MedHermes method not found: ' + method);
        }
        return instance[method].apply(instance, args || []);
      });
    }

    host.MedHermesLoader = {
      ready: function (fn) {
        if (loaderState.instance && loaderState.initPromise) {
          loaderState.initPromise.then(function (instance) {
            try { fn(instance); } catch (e) { console.error(e); }
          });
          return;
        }
        loaderState.readyCallbacks.push(fn);
        ensureReady();
      },
      onError: function (fn) {
        loaderState.errorCallbacks.push(fn);
      },
      getStatus: function () {
        return {
          online: !!(loaderState.instance && loaderState.instance._connected),
          sdkLoaded: true,
          instance: loaderState.instance
        };
      },
      ping: function () {
        return getInstance().ping();
      },
      detect: function () {
        return getInstance().ping()
          .then(function () { return true; })
          .catch(function () { return false; });
      },
      launch: function () {
        return getInstance()._launcher.launch('launch');
      },
      init: function (extra) {
        loaderState.initPromise = null;
        return ensureReady(extra);
      },
      startConsultation: function (patient) {
        return call('startConsultation', [patient]);
      },
      assist: function (patient, action) {
        return call('assist', [patient, action]);
      },
      startVoice: function (patient) {
        return call('startVoice', [patient]);
      },
      interpretReport: function () {
        return call('interpretReport', Array.prototype.slice.call(arguments));
      },
      receivePatient: function (patientId, optionalInfo) {
        return call('receivePatient', [patientId, optionalInfo]);
      },
      sendRisks: function (patient, risks) {
        return call('sendRisks', [patient, risks]);
      },
      sendFeedback: function (requestId, status, message, items) {
        return call('sendFeedback', [requestId, status, message, items]);
      },
      stop: function () {
        return call('stop', []);
      }
    };
  }

  ensureFallbackLoader();

  return MedHermes;
});
