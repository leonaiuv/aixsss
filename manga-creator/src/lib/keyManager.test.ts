import { beforeEach, describe, expect, it } from 'vitest';
import {
  KeyManager,
  KeyPurpose,
} from './keyManager';

// ==========================================
// Mock localStorage
// ==========================================

function createMockLocalStorage(): Storage {
  const store: Record<string, string> = {};

  const mockStorage = {
    get length() {
      return Object.keys(store).length;
    },
    clear() {
      Object.keys(store).forEach((key) => delete store[key]);
    },
    getItem(key: string) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    key(index: number) {
      return Object.keys(store)[index] ?? null;
    },
    removeItem(key: string) {
      delete store[key];
    },
    setItem(key: string, value: string) {
      store[key] = value;
    },
  };

  return new Proxy(mockStorage as Storage, {
    ownKeys() {
      return Object.keys(store);
    },
    getOwnPropertyDescriptor(target, prop) {
      if (typeof prop === 'string' && prop in store) {
        return {
          enumerable: true,
          configurable: true,
          value: store[prop],
        };
      }
      return Object.getOwnPropertyDescriptor(target, prop);
    },
  });
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: createMockLocalStorage(),
    writable: true,
  });
  KeyManager.reset();
});

// ==========================================
// 密钥派生测试
// ==========================================

describe('密钥派生功能', () => {
  it('应从主密码派生出密钥', () => {
    const masterPassword = 'user-master-password-123';
    KeyManager.initialize(masterPassword);
    
    const derivedKey = KeyManager.getDerivedKey(KeyPurpose.CONFIG);
    expect(derivedKey).toBeDefined();
    expect(derivedKey.length).toBeGreaterThan(0);
  });

  it('相同密码相同用途应派生出相同密钥', () => {
    const masterPassword = 'test-password';
    
    KeyManager.initialize(masterPassword);
    const key1 = KeyManager.getDerivedKey(KeyPurpose.CONFIG);
    
    KeyManager.reset();
    KeyManager.initialize(masterPassword);
    const key2 = KeyManager.getDerivedKey(KeyPurpose.CONFIG);
    
    expect(key1).toBe(key2);
  });

  it('不同用途应派生出不同密钥', () => {
    KeyManager.initialize('test-password');
    
    const configKey = KeyManager.getDerivedKey(KeyPurpose.CONFIG);
    const projectKey = KeyManager.getDerivedKey(KeyPurpose.PROJECT);
    const sceneKey = KeyManager.getDerivedKey(KeyPurpose.SCENE);
    
    expect(configKey).not.toBe(projectKey);
    expect(configKey).not.toBe(sceneKey);
    expect(projectKey).not.toBe(sceneKey);
  });

  it('不同密码应派生出不同密钥', () => {
    KeyManager.initialize('password-1');
    const key1 = KeyManager.getDerivedKey(KeyPurpose.CONFIG);
    
    KeyManager.reset();
    KeyManager.initialize('password-2');
    const key2 = KeyManager.getDerivedKey(KeyPurpose.CONFIG);
    
    expect(key1).not.toBe(key2);
  });

  it('未初始化时应使用默认密钥（向后兼容）', () => {
    // 未调用 initialize，应使用遗留密钥模式
    const key = KeyManager.getDerivedKey(KeyPurpose.CONFIG);
    expect(key).toBeDefined();
  });
});

// ==========================================
// 加密解密测试
// ==========================================

describe('加密解密功能', () => {
  it('应正确加密和解密配置数据', () => {
    KeyManager.initialize('my-secure-password');
    
    const original = JSON.stringify({ apiKey: 'sk-secret-key-12345', provider: 'openai' });
    const encrypted = KeyManager.encrypt(original, KeyPurpose.CONFIG);
    const decrypted = KeyManager.decrypt(encrypted, KeyPurpose.CONFIG);
    
    expect(encrypted).not.toBe(original);
    expect(decrypted).toBe(original);
  });

  it('应正确加密和解密项目数据', () => {
    KeyManager.initialize('my-secure-password');
    
    const original = 'Project sensitive data';
    const encrypted = KeyManager.encrypt(original, KeyPurpose.PROJECT);
    const decrypted = KeyManager.decrypt(encrypted, KeyPurpose.PROJECT);
    
    expect(decrypted).toBe(original);
  });

  it('应正确加密和解密分镜数据', () => {
    KeyManager.initialize('my-secure-password');
    
    const original = 'Scene sensitive data';
    const encrypted = KeyManager.encrypt(original, KeyPurpose.SCENE);
    const decrypted = KeyManager.decrypt(encrypted, KeyPurpose.SCENE);
    
    expect(decrypted).toBe(original);
  });

  it('使用错误用途解密应失败', () => {
    KeyManager.initialize('my-secure-password');
    
    const original = 'Secret data';
    const encrypted = KeyManager.encrypt(original, KeyPurpose.CONFIG);
    
    // 用不同用途的密钥解密
    const decrypted = KeyManager.decrypt(encrypted, KeyPurpose.PROJECT);
    expect(decrypted).toBe(''); // 应返回空字符串表示解密失败
  });

  it('使用错误密码解密应失败', () => {
    KeyManager.initialize('correct-password');
    const encrypted = KeyManager.encrypt('Secret data', KeyPurpose.CONFIG);
    
    KeyManager.reset();
    KeyManager.initialize('wrong-password');
    const decrypted = KeyManager.decrypt(encrypted, KeyPurpose.CONFIG);
    
    expect(decrypted).toBe('');
  });

  it('应处理空字符串', () => {
    KeyManager.initialize('password');
    
    const encrypted = KeyManager.encrypt('', KeyPurpose.CONFIG);
    const decrypted = KeyManager.decrypt(encrypted, KeyPurpose.CONFIG);
    
    expect(decrypted).toBe('');
  });

  it('应处理包含中文和特殊字符的数据', () => {
    KeyManager.initialize('password');
    
    const original = '中文数据 🎉 Special chars: !@#$%^&*()';
    const encrypted = KeyManager.encrypt(original, KeyPurpose.CONFIG);
    const decrypted = KeyManager.decrypt(encrypted, KeyPurpose.CONFIG);
    
    expect(decrypted).toBe(original);
  });
});

// ==========================================
// 密钥轮换测试
// ==========================================

describe('密钥轮换功能', () => {
  it('应能更换主密码', () => {
    KeyManager.initialize('old-password');
    const oldKey = KeyManager.getDerivedKey(KeyPurpose.CONFIG);
    
    KeyManager.changeMasterPassword('new-password');
    const newKey = KeyManager.getDerivedKey(KeyPurpose.CONFIG);
    
    expect(oldKey).not.toBe(newKey);
  });

  it('更换密码后旧加密数据应可重新加密', () => {
    KeyManager.initialize('old-password');
    const original = 'Sensitive data';
    const oldEncrypted = KeyManager.encrypt(original, KeyPurpose.CONFIG);
    
    // 记录旧密钥用于迁移
    const oldKey = KeyManager.getDerivedKey(KeyPurpose.CONFIG);
    
    // 更换密码
    KeyManager.changeMasterPassword('new-password');
    
    // 使用旧密钥解密
    const decrypted = KeyManager.decryptWithKey(oldEncrypted, oldKey);
    expect(decrypted).toBe(original);
    
    // 使用新密钥重新加密
    const newEncrypted = KeyManager.encrypt(decrypted, KeyPurpose.CONFIG);
    const finalDecrypted = KeyManager.decrypt(newEncrypted, KeyPurpose.CONFIG);
    expect(finalDecrypted).toBe(original);
  });

  it('应支持批量重新加密数据', () => {
    KeyManager.initialize('old-password');
    
    const dataItems = [
      'Data item 1',
      'Data item 2',
      'Data item 3',
    ];
    
    // 使用旧密码加密
    const encryptedItems = dataItems.map(d => 
      KeyManager.encrypt(d, KeyPurpose.CONFIG)
    );
    
    // 获取旧密钥
    const oldKey = KeyManager.getDerivedKey(KeyPurpose.CONFIG);
    
    // 更换密码
    KeyManager.changeMasterPassword('new-password');
    
    // 批量迁移
    const migratedItems = encryptedItems.map(encrypted => {
      const decrypted = KeyManager.decryptWithKey(encrypted, oldKey);
      return KeyManager.encrypt(decrypted, KeyPurpose.CONFIG);
    });
    
    // 验证迁移后数据正确
    migratedItems.forEach((encrypted, index) => {
      const decrypted = KeyManager.decrypt(encrypted, KeyPurpose.CONFIG);
      expect(decrypted).toBe(dataItems[index]);
    });
  });
});

// ==========================================
// 密钥版本管理测试
// ==========================================

describe('密钥版本管理', () => {
  it('应保存密钥版本信息', () => {
    KeyManager.initialize('password');
    
    const version = KeyManager.getKeyVersion();
    expect(version).toBe(1);
  });

  it('更换密码后版本号应递增', () => {
    KeyManager.initialize('password-1');
    expect(KeyManager.getKeyVersion()).toBe(1);
    
    KeyManager.changeMasterPassword('password-2');
    expect(KeyManager.getKeyVersion()).toBe(2);
    
    KeyManager.changeMasterPassword('password-3');
    expect(KeyManager.getKeyVersion()).toBe(3);
  });

  it('加密数据应包含密钥版本', () => {
    KeyManager.initialize('password');
    
    const encrypted = KeyManager.encrypt('data', KeyPurpose.CONFIG);
    const metadata = KeyManager.extractMetadata(encrypted);
    
    expect(metadata.keyVersion).toBe(1);
  });

  it('应能识别使用旧版本密钥加密的数据', () => {
    KeyManager.initialize('password-v1');
    const encryptedV1 = KeyManager.encrypt('data', KeyPurpose.CONFIG);
    
    KeyManager.changeMasterPassword('password-v2');
    const encryptedV2 = KeyManager.encrypt('data', KeyPurpose.CONFIG);
    
    expect(KeyManager.extractMetadata(encryptedV1).keyVersion).toBe(1);
    expect(KeyManager.extractMetadata(encryptedV2).keyVersion).toBe(2);
  });
});

// ==========================================
// Salt 管理测试
// ==========================================

describe('Salt 管理', () => {
  it('首次初始化应生成随机 Salt', () => {
    KeyManager.initialize('password');
    
    const salt = KeyManager.getSalt();
    expect(salt).toBeDefined();
    expect(salt.length).toBeGreaterThan(0);
  });

  it('Salt 应持久化存储', () => {
    KeyManager.initialize('password');
    const salt1 = KeyManager.getSalt();
    
    KeyManager.reset();
    KeyManager.initialize('password');
    const salt2 = KeyManager.getSalt();
    
    expect(salt1).toBe(salt2);
  });

  it('应能设置自定义 Salt', () => {
    const customSalt = 'my-custom-salt-value';
    KeyManager.initialize('password', { salt: customSalt });
    
    expect(KeyManager.getSalt()).toBe(customSalt);
  });
});

// ==========================================
// 向后兼容测试
// ==========================================

describe('向后兼容性', () => {
  it('未设置密码时应使用遗留密钥解密旧数据', () => {
    // 模拟旧版本加密的数据（使用硬编码密钥）
    const legacyKey = 'aixs-manga-creator-secret-key-2024';
    
    // 不初始化（使用遗留模式）
    const encrypted = KeyManager.encryptWithKey('old data', legacyKey);
    const decrypted = KeyManager.decryptWithKey(encrypted, legacyKey);
    
    expect(decrypted).toBe('old data');
  });

  it('迁移模式应能读取旧数据并用新密钥重新加密', () => {
    const legacyKey = 'aixs-manga-creator-secret-key-2024';
    const oldData = 'Legacy encrypted data';
    
    // 使用遗留密钥加密
    const legacyEncrypted = KeyManager.encryptWithKey(oldData, legacyKey);
    
    // 初始化新密钥
    KeyManager.initialize('new-secure-password');
    
    // 使用遗留密钥解密
    const decrypted = KeyManager.decryptWithKey(legacyEncrypted, legacyKey);
    expect(decrypted).toBe(oldData);
    
    // 使用新密钥重新加密
    const newEncrypted = KeyManager.encrypt(decrypted, KeyPurpose.CONFIG);
    const finalDecrypted = KeyManager.decrypt(newEncrypted, KeyPurpose.CONFIG);
    expect(finalDecrypted).toBe(oldData);
  });

  it('isLegacyEncrypted 应正确识别旧格式数据', () => {
    const legacyKey = 'aixs-manga-creator-secret-key-2024';
    const legacyEncrypted = KeyManager.encryptWithKey('data', legacyKey);
    
    KeyManager.initialize('password');
    const newEncrypted = KeyManager.encrypt('data', KeyPurpose.CONFIG);
    
    expect(KeyManager.isLegacyEncrypted(legacyEncrypted)).toBe(true);
    expect(KeyManager.isLegacyEncrypted(newEncrypted)).toBe(false);
  });
});

// ==========================================
// 密钥状态测试
// ==========================================

describe('密钥状态管理', () => {
  it('isInitialized 应正确反映初始化状态', () => {
    expect(KeyManager.isInitialized()).toBe(false);
    
    KeyManager.initialize('password');
    expect(KeyManager.isInitialized()).toBe(true);
    
    KeyManager.reset();
    expect(KeyManager.isInitialized()).toBe(false);
  });

  it('hasCustomPassword 应区分自定义密码和遗留模式', () => {
    // 未初始化，使用遗留模式
    expect(KeyManager.hasCustomPassword()).toBe(false);
    
    // 使用自定义密码初始化
    KeyManager.initialize('my-password');
    expect(KeyManager.hasCustomPassword()).toBe(true);
  });

  it('getKeyInfo 应返回完整的密钥信息', () => {
    KeyManager.initialize('password');
    
    const info = KeyManager.getKeyInfo();
    expect(info.version).toBe(1);
    expect(info.hasCustomPassword).toBe(true);
    expect(info.purposes).toContain(KeyPurpose.CONFIG);
    expect(info.purposes).toContain(KeyPurpose.PROJECT);
    expect(info.purposes).toContain(KeyPurpose.SCENE);
  });
});
