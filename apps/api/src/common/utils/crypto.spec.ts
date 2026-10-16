import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
  hmacSha256Hex,
  randomToken,
  sha256Hex,
  shortHash8,
} from './crypto';

describe('crypto utils', () => {
  it('sha256Hex menghasilkan digest SHA-256 hex yang benar', () => {
    const expected = createHash('sha256').update('hello').digest('hex');
    expect(sha256Hex('hello')).toBe(expected);
    expect(sha256Hex('hello')).toHaveLength(64);
    expect(sha256Hex(Buffer.from('hello'))).toBe(expected);
  });

  it('sha256Hex deterministik dan sensitif terhadap input', () => {
    expect(sha256Hex('a')).not.toBe(sha256Hex('b'));
    expect(sha256Hex('sama')).toBe(sha256Hex('sama'));
  });

  it('hmacSha256Hex memakai secret dengan benar', () => {
    const a = hmacSha256Hex('data', 'secret-1');
    const b = hmacSha256Hex('data', 'secret-2');
    expect(a).toHaveLength(64);
    expect(a).not.toBe(b);
    expect(hmacSha256Hex('data', 'secret-1')).toBe(a);
  });

  it('shortHash8 mengembalikan 8 karakter hex stabil', () => {
    const h = shortHash8('nip-123|2026-10-16');
    expect(h).toHaveLength(8);
    expect(h).toMatch(/^[0-9a-f]{8}$/);
    expect(shortHash8('nip-123|2026-10-16')).toBe(h);
    expect(shortHash8('lain')).not.toBe(h);
  });

  it('randomToken menghasilkan hex acak sepanjang 2x bytes', () => {
    const t1 = randomToken();
    const t2 = randomToken();
    expect(t1).toHaveLength(64);
    expect(t1).toMatch(/^[0-9a-f]+$/);
    expect(t1).not.toBe(t2);
    expect(randomToken(16)).toHaveLength(32);
  });
});
