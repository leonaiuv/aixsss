export type DataMode = 'local' | 'api';

function normalizeMode(value: unknown): DataMode | null {
  if (value === 'local' || value === 'api') return value;
  return null;
}

export function getDataMode(): DataMode {
  const explicit = normalizeMode(import.meta.env.VITE_DATA_MODE);
  if (explicit) return explicit;

  // 测试环境默认走本地（避免依赖后端/网络）
  if (import.meta.env.MODE === 'test') return 'local';

  // 生产/开发默认走 API（生产级：数据落库、权限隔离）
  return 'api';
}

export function isApiMode(): boolean {
  return getDataMode() === 'api';
}

export function getApiBasePath(): string {
  const base = typeof import.meta.env.VITE_API_BASE_PATH === 'string' ? import.meta.env.VITE_API_BASE_PATH : '';
  return base?.trim() ? base.trim().replace(/\/$/, '') : '/api';
}



