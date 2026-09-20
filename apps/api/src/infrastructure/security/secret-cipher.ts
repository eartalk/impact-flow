import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

@Injectable()
export class SecretCipher {
  constructor(private readonly config: ConfigService) {}

  encrypt(value: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return ['v1', iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join(':');
  }

  decrypt(value: string) {
    const [version, iv, tag, encrypted] = value.split(':');
    if (version !== 'v1' || !iv || !tag || !encrypted) {
      throw new Error('无法识别已保存的敏感配置');
    }
    const decipher = createDecipheriv('aes-256-gcm', this.key(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(encrypted, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }

  private key() {
    const material = this.config.get<string>('AI_CONFIG_ENCRYPTION_KEY')
      || this.config.get<string>('DATABASE_PASSWORD_BASE64');
    if (!material) {
      throw new Error('请配置 AI_CONFIG_ENCRYPTION_KEY 后再保存敏感配置');
    }
    return createHash('sha256').update(material).digest();
  }
}
