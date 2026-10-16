import { createHash, createHmac, randomBytes } from 'node:crypto';

/** HMAC-SHA256 dalam hex — dipakai untuk watermark foto & signature media. */
export function hmacSha256Hex(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data, 'utf8').digest('hex');
}

/** SHA-256 dalam hex — dipakai untuk hash refresh token & checksum berkas. */
export function sha256Hex(input: Buffer | string): string {
  return createHash('sha256').update(input).digest('hex');
}

/** Kode hash integritas 8 karakter untuk sudut foto watermark. */
export function shortHash8(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex').slice(0, 8);
}

/** Token acak dalam hex — dipakai untuk refresh token (opaque). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}
