export interface RegionalConfig {
  /** core-service base URL, e.g. http://192.168.1.100:8080 */
  baseUrl: string;
  /** Organization code */
  orgCode: string;
  /** Stable device code, preferably derived from MAC address */
  deviceCode: string;
}

export interface RegionalConnectionConfig extends RegionalConfig {
  enabled: boolean;
}

export interface RegisterRequest {
  cdDevice: string;
  naDevice: string;
  cdOrg: string;
  clientVersion: string;
  updateChannel: string;
  osInfo: string;
  publicKey: string;
}

export interface RegisterResponse {
  idDevice: string;
  deviceToken: string;
  heartbeatInterval: number;
  hasPublicKey?: boolean;
}

export interface BootstrapConfig {
  llm: {
    baseUrl: string;
    model: string;
    fastModel?: string;
    enableThinking?: boolean;
    audioBaseUrl?: string;
    audioModel?: string;
  };
  speech?: {
    provider: string;
    model?: string;
  };
  knowledgeBase?: {
    enabled: boolean;
    baseUrl?: string;
  };
  pmphai?: {
    enabled: boolean;
  };
  reviewer?: {
    enabled: boolean;
    model?: string;
    checkExaminationEnabled?: boolean;
  };
  features: Record<string, boolean>;
  templateVersion: string;
  dataPackageVersion: string;
  promptVersion: string;
}

export interface HeartbeatResponse {
  status: 'ok';
  serverTime: number;
}

export interface ApiResponse<T> {
  code: string;
  message: string;
  data: T;
  requestId: string;
  timestamp: number;
}

export interface RegionalErrorInfo {
  code?: string;
  message: string;
}

export interface RegionalSpeechUploadPayload {
  audio: string;
  mimeType?: string;
  format?: string;
  fileName?: string;
  scene?: string;
}
