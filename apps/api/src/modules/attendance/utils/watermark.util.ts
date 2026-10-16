import { hmacSha256Hex } from '../../../common/utils/crypto';

/**
 * Secret untuk HMAC watermark foto presensi.
 * Diambil dari env WATERMARK_HMAC_SECRET (fallback dev-only).
 */
export function getWatermarkSecret(): string {
  return process.env.WATERMARK_HMAC_SECRET ?? 'dev-watermark-secret-change-me';
}

/**
 * HMAC-SHA256 8 karakter (hex) — kode integritas watermark foto
 * yang dibakar ke overlay canvas di sisi klien.
 */
export function hmac8(payload: string, secret?: string): string {
  return hmacSha256Hex(payload, secret ?? getWatermarkSecret()).slice(0, 8);
}

/** Payload watermark standar: `${userId}|${serverTimeISO}`. */
export function watermarkPayload(userId: string, serverTimeISO: string): string {
  return `${userId}|${serverTimeISO}`;
}
