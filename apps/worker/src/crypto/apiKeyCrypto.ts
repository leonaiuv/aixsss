import { createDecipheriv, createHash } from 'node:crypto';

function deriveKey(raw: string): Buffer {
  const base = Buffer.from(raw, 'base64');
  return base.length === 32 ? base : createHash('sha256').update(raw).digest();
}

export function decryptApiKey(encrypted: string, secret: string): string {
  const key = deriveKey(secret);
  const [ivB64, tagB64, dataB64] = encrypted.split('.');
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Invalid encrypted payload');
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(data), decipher.final()]);
  return plaintext.toString('utf8');
}


