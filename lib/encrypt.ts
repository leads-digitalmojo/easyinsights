import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // Standard IV length for GCM
const TAG_LENGTH = 16; // 128-bit authentication tag

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;

  // In production a real key is mandatory — never fall back to a hardcoded
  // value, or every deployment would encrypt tokens with a key visible in
  // source control (anyone with a DB dump could decrypt Meta/Google tokens).
  if (!key) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'ENCRYPTION_KEY environment variable is not set. Refusing to encrypt/decrypt with a default key in production.'
      );
    }
    // Local/dev sandbox only — deterministic key for offline verification.
    const devKey = 'default_32_byte_secret_key_mock_123';
    return Buffer.from(devKey.substring(0, 32), 'utf-8');
  }

  if (key.length >= 32) {
    return Buffer.from(key.substring(0, 32), 'utf-8');
  }
  return Buffer.alloc(32, key, 'utf-8');
}

/**
 * Encrypts cleartext using AES-256-GCM.
 * Returns payload in standard format: iv:authTag:ciphertext (hex-encoded)
 */
export function encrypt(text: string): string {
  if (!text) return '';
  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag().toString('hex');

    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  } catch (error) {
    console.error('Encryption utility failure:', error);
    throw new Error('Encryption process failed.');
  }
}

/**
 * Decrypts ciphertext in the format iv:authTag:ciphertext.
 * If format is invalid or decryption fails, returns original text (fallback grace).
 */
export function decrypt(text: string): string {
  if (!text) return '';
  try {
    const parts = text.split(':');
    if (parts.length !== 3) {
      // Return as-is if the text is not in our encrypted format
      return text;
    }

    const iv = Buffer.from(parts[0]!, 'hex');
    const authTag = Buffer.from(parts[1]!, 'hex');
    const encryptedText = parts[2]!;

    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.warn('[Decryption Warning] Decryption failed, returning input text. Error:', error.message);
    return text;
  }
}
