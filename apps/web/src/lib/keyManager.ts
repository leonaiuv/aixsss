import CryptoJS from 'crypto-js';

// ==========================================
// 常量定义
// ==========================================

/** 遗留密钥 - 用于向后兼容旧数据 */
const LEGACY_ENCRYPTION_KEY = 'aixs-manga-creator-secret-key-2024';

/** 默认 Salt（用于向后兼容，新用户会生成随机 Salt） */
export const DEFAULT_SALT = 'aixs-manga-creator-default-salt';

/** 存储键名 */
const STORAGE_KEYS = {
  SALT: 'aixs_key_salt',
  KEY_VERSION: 'aixs_key_version',
  HAS_CUSTOM_PASSWORD: 'aixs_has_custom_password',
};

/** PBKDF2 迭代次数 */
const PBKDF2_ITERATIONS = import.meta.env.MODE === 'test' ? 200 : 10000;

/** 派生密钥长度（256位） */
const KEY_SIZE = 256 / 32;

/** 加密数据前缀标识 */
const ENCRYPTED_PREFIX = 'AIXS_V2:';

/** 密钥校验标记（用于验证密码是否正确） */
export const ENCRYPTION_CHECK_KEY = 'aixs_key_check';

// ==========================================
// 密钥用途枚举
// ==========================================

export enum KeyPurpose {
  /** API 配置数据 */
  CONFIG = 'config',
  /** 项目数据 */
  PROJECT = 'project',
  /** 分镜数据 */
  SCENE = 'scene',
  /** 通用数据 */
  GENERAL = 'general',
}

// ==========================================
// 类型定义
// ==========================================

interface KeyManagerState {
  masterPassword: string | null;
  salt: string;
  keyVersion: number;
  derivedKeys: Map<KeyPurpose, string>;
  initialized: boolean;
  hasCustomPassword: boolean;
}

interface EncryptedMetadata {
  keyVersion: number;
  purpose?: KeyPurpose;
}

interface KeyInfo {
  version: number;
  hasCustomPassword: boolean;
  purposes: KeyPurpose[];
}

interface InitializeOptions {
  salt?: string;
}

// ==========================================
// 密钥管理器实现
// ==========================================

class KeyManagerImpl {
  private state: KeyManagerState = {
    masterPassword: null,
    salt: DEFAULT_SALT,
    keyVersion: 1,
    derivedKeys: new Map(),
    initialized: false,
    hasCustomPassword: false,
  };

  /**
   * 初始化密钥管理器
   * @param masterPassword 主密码
   * @param options 初始化选项
   */
  initialize(masterPassword: string, options?: InitializeOptions): void {
    // 加载或生成 Salt
    const storedSalt = localStorage.getItem(STORAGE_KEYS.SALT);
    if (options?.salt) {
      this.state.salt = options.salt;
      localStorage.setItem(STORAGE_KEYS.SALT, options.salt);
    } else if (storedSalt) {
      this.state.salt = storedSalt;
    } else {
      // 首次使用，生成随机 Salt
      this.state.salt = this.generateRandomSalt();
      localStorage.setItem(STORAGE_KEYS.SALT, this.state.salt);
    }

    // 加载密钥版本
    const storedVersion = localStorage.getItem(STORAGE_KEYS.KEY_VERSION);
    this.state.keyVersion = storedVersion ? parseInt(storedVersion, 10) : 1;
    localStorage.setItem(STORAGE_KEYS.KEY_VERSION, this.state.keyVersion.toString());

    // 设置主密码并派生密钥
    this.state.masterPassword = masterPassword;
    this.state.hasCustomPassword = true;
    this.state.initialized = true;

    // 标记已设置自定义密码
    localStorage.setItem(STORAGE_KEYS.HAS_CUSTOM_PASSWORD, 'true');

    // 清除之前派生的密钥，重新派生
    this.state.derivedKeys.clear();
    this.deriveAllKeys();
  }

  /**
   * 重置密钥管理器状态
   */
  reset(): void {
    this.state = {
      masterPassword: null,
      salt: DEFAULT_SALT,
      keyVersion: 1,
      derivedKeys: new Map(),
      initialized: false,
      hasCustomPassword: false,
    };
  }

  /**
   * 更换主密码
   * @param newPassword 新密码
   */
  changeMasterPassword(newPassword: string): void {
    // 递增版本号
    this.state.keyVersion += 1;
    localStorage.setItem(STORAGE_KEYS.KEY_VERSION, this.state.keyVersion.toString());

    // 设置新密码并重新派生密钥
    this.state.masterPassword = newPassword;
    this.state.derivedKeys.clear();
    this.deriveAllKeys();
  }

  /**
   * 获取派生密钥
   * @param purpose 密钥用途
   */
  getDerivedKey(purpose: KeyPurpose): string {
    // 如果未初始化，使用遗留密钥
    if (!this.state.initialized) {
      return LEGACY_ENCRYPTION_KEY;
    }

    // 如果密钥已缓存，直接返回
    if (this.state.derivedKeys.has(purpose)) {
      return this.state.derivedKeys.get(purpose)!;
    }

    // 派生新密钥
    const derivedKey = this.deriveKey(purpose);
    this.state.derivedKeys.set(purpose, derivedKey);
    return derivedKey;
  }

  /**
   * 加密数据
   * @param data 要加密的数据
   * @param purpose 数据用途
   */
  encrypt(data: string, purpose: KeyPurpose): string {
    const key = this.getDerivedKey(purpose);
    const encrypted = CryptoJS.AES.encrypt(data, key).toString();

    // 完整性校验（防止错误密码解密出乱码）
    const integrity = CryptoJS.HmacSHA256(encrypted, key).toString();

    // 添加版本和用途元数据
    const metadata = {
      v: this.state.keyVersion,
      p: purpose,
      h: integrity,
    };
    const metadataStr = btoa(JSON.stringify(metadata));

    return `${ENCRYPTED_PREFIX}${metadataStr}:${encrypted}`;
  }

  /**
   * 解密数据
   * @param encryptedData 加密的数据
   * @param purpose 数据用途
   */
  decrypt(encryptedData: string, purpose: KeyPurpose): string {
    try {
      // 检查是否为新格式
      if (encryptedData.startsWith(ENCRYPTED_PREFIX)) {
        const withoutPrefix = encryptedData.slice(ENCRYPTED_PREFIX.length);
        const colonIndex = withoutPrefix.indexOf(':');
        if (colonIndex <= 0) return '';

        const metadataStr = withoutPrefix.slice(0, colonIndex);
        const actualEncrypted = withoutPrefix.slice(colonIndex + 1);

        // 元数据校验：用途不匹配时直接失败（避免“解密出乱码”误判为成功）
        try {
          if (typeof atob !== 'function') return '';
          const decoded = atob(metadataStr);
          const metadata = JSON.parse(decoded) as { p?: unknown; v?: unknown; h?: unknown };
          if (typeof metadata.p === 'string' && metadata.p !== purpose) return '';

          const key = this.getDerivedKey(purpose);
          if (
            typeof metadata.h === 'string' &&
            metadata.h !== CryptoJS.HmacSHA256(actualEncrypted, key).toString()
          ) {
            return '';
          }

          const bytes = CryptoJS.AES.decrypt(actualEncrypted, key);
          const decrypted = bytes.toString(CryptoJS.enc.Utf8);

          return decrypted;
        } catch {
          // 元数据损坏：按失败处理
          return '';
        }
      }

      // 旧格式数据，使用遗留密钥
      return this.decryptWithKey(encryptedData, LEGACY_ENCRYPTION_KEY);
    } catch {
      return '';
    }
  }

  /**
   * 使用指定密钥加密
   * @param data 要加密的数据
   * @param key 加密密钥
   */
  encryptWithKey(data: string, key: string): string {
    return CryptoJS.AES.encrypt(data, key).toString();
  }

  /**
   * 使用指定密钥解密
   * @param encryptedData 加密的数据
   * @param key 解密密钥
   */
  decryptWithKey(encryptedData: string, key: string): string {
    try {
      // 如果是新格式，提取实际加密内容
      let actualEncrypted = encryptedData;
      if (encryptedData.startsWith(ENCRYPTED_PREFIX)) {
        const withoutPrefix = encryptedData.slice(ENCRYPTED_PREFIX.length);
        const colonIndex = withoutPrefix.indexOf(':');
        actualEncrypted = withoutPrefix.slice(colonIndex + 1);
      }

      const bytes = CryptoJS.AES.decrypt(actualEncrypted, key);
      return bytes.toString(CryptoJS.enc.Utf8);
    } catch {
      return '';
    }
  }

  /**
   * 获取密钥版本
   */
  getKeyVersion(): number {
    return this.state.keyVersion;
  }

  /**
   * 获取 Salt
   */
  getSalt(): string {
    return this.state.salt;
  }

  /**
   * 提取加密数据的元数据
   * @param encryptedData 加密的数据
   */
  extractMetadata(encryptedData: string): EncryptedMetadata {
    if (!encryptedData.startsWith(ENCRYPTED_PREFIX)) {
      // 旧格式数据，返回默认版本
      return { keyVersion: 0 };
    }

    try {
      const withoutPrefix = encryptedData.slice(ENCRYPTED_PREFIX.length);
      const colonIndex = withoutPrefix.indexOf(':');
      const metadataStr = withoutPrefix.slice(0, colonIndex);
      const metadata = JSON.parse(atob(metadataStr));

      return {
        keyVersion: metadata.v || 1,
        purpose: metadata.p as KeyPurpose,
      };
    } catch {
      return { keyVersion: 1 };
    }
  }

  /**
   * 判断是否为遗留格式加密数据
   * @param encryptedData 加密的数据
   */
  isLegacyEncrypted(encryptedData: string): boolean {
    return !encryptedData.startsWith(ENCRYPTED_PREFIX);
  }

  /**
   * 检查是否已初始化
   */
  isInitialized(): boolean {
    return this.state.initialized;
  }

  /**
   * 检查是否使用自定义密码
   */
  hasCustomPassword(): boolean {
    if (this.state.hasCustomPassword) return true;
    try {
      return localStorage.getItem(STORAGE_KEYS.HAS_CUSTOM_PASSWORD) === 'true';
    } catch {
      return false;
    }
  }

  /**
   * 获取密钥信息
   */
  getKeyInfo(): KeyInfo {
    return {
      version: this.state.keyVersion,
      hasCustomPassword: this.state.hasCustomPassword,
      purposes: Object.values(KeyPurpose),
    };
  }

  // ==========================================
  // 私有方法
  // ==========================================

  /**
   * 派生特定用途的密钥
   * @param purpose 密钥用途
   */
  private deriveKey(purpose: KeyPurpose): string {
    if (!this.state.masterPassword) {
      return LEGACY_ENCRYPTION_KEY;
    }

    // 使用 PBKDF2 派生密钥，Salt 结合用途确保不同用途密钥不同
    const combinedSalt = `${this.state.salt}:${purpose}`;
    const derivedKey = CryptoJS.PBKDF2(this.state.masterPassword, combinedSalt, {
      keySize: KEY_SIZE,
      iterations: PBKDF2_ITERATIONS,
    });

    return derivedKey.toString();
  }

  /**
   * 派生所有用途的密钥
   */
  private deriveAllKeys(): void {
    for (const purpose of Object.values(KeyPurpose)) {
      const key = this.deriveKey(purpose);
      this.state.derivedKeys.set(purpose, key);
    }
  }

  /**
   * 生成随机 Salt
   */
  private generateRandomSalt(): string {
    const randomBytes = CryptoJS.lib.WordArray.random(16);
    return randomBytes.toString();
  }
}

// ==========================================
// 导出单例实例
// ==========================================

export const KeyManager = new KeyManagerImpl();

// ==========================================
// 外部辅助函数（用于“解锁/验证密码”场景）
// ==========================================

export function deriveKeyFromPassword(
  masterPassword: string,
  purpose: KeyPurpose,
  salt: string,
): string {
  const combinedSalt = `${salt}:${purpose}`;
  const derivedKey = CryptoJS.PBKDF2(masterPassword, combinedSalt, {
    keySize: KEY_SIZE,
    iterations: PBKDF2_ITERATIONS,
  });
  return derivedKey.toString();
}

export function getStoredSalt(): string {
  try {
    return localStorage.getItem(STORAGE_KEYS.SALT) || DEFAULT_SALT;
  } catch {
    return DEFAULT_SALT;
  }
}

export function verifyMasterPassword(masterPassword: string): boolean {
  try {
    if (!KeyManager.hasCustomPassword()) return true;

    const salt = getStoredSalt();

    const encryptedCheck = localStorage.getItem(ENCRYPTION_CHECK_KEY);
    if (encryptedCheck) {
      const key = deriveKeyFromPassword(masterPassword, KeyPurpose.GENERAL, salt);
      const decrypted = KeyManager.decryptWithKey(encryptedCheck, key);
      if (decrypted === 'ok') return true;
      return false;
    }

    // 兼容旧数据：没有校验标记时，尝试解密已存的配置
    const encryptedConfig = localStorage.getItem('aixs_config');
    if (!encryptedConfig) return true;

    const key = deriveKeyFromPassword(masterPassword, KeyPurpose.CONFIG, salt);
    const decrypted = KeyManager.decryptWithKey(encryptedConfig, key);
    if (!decrypted) return false;

    try {
      const parsed = JSON.parse(decrypted) as unknown;
      return Boolean(parsed && typeof parsed === 'object');
    } catch {
      return false;
    }
  } catch {
    return false;
  }
}
