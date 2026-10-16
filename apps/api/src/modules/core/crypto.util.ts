import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
} from 'node:crypto';

/** SHA-256 hex — dipakai untuk checksum scan PDF surat. */
export function sha256Hex(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Enkripsi AES-256-GCM untuk PDF slip gaji.
 * Layout blob: salt(16B) | iv(12B) | ciphertext | authTag(16B).
 * Kunci diturunkan dari password via scrypt (N=16384 default node).
 */
export function encryptAes256Gcm(plaintext: Buffer, password: string): Buffer {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, 32);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([salt, iv, ciphertext, tag]);
}

/** Dekripsi blob hasil encryptAes256Gcm. Melempar bila password salah / blob korup. */
export function decryptAes256Gcm(blob: Buffer, password: string): Buffer {
  if (blob.length < 16 + 12 + 16) {
    throw new Error('Blob terenkripsi tidak valid (terlalu pendek)');
  }
  const salt = blob.subarray(0, 16);
  const iv = blob.subarray(16, 28);
  const tag = blob.subarray(blob.length - 16);
  const ciphertext = blob.subarray(28, blob.length - 16);
  const key = scryptSync(password, salt, 32);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
