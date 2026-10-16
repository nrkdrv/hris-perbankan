import { describe, expect, it } from 'vitest';
import {
  checkGeofence,
  haversineMeters,
  isImpossibleTravel,
  travelSpeedKmh,
} from './geo.js';

describe('haversineMeters', () => {
  it('1 derajat bujur di ekuator ≈ 111.19 km', () => {
    const d = haversineMeters(0, 0, 0, 1);
    expect(d).toBeGreaterThan(111_000);
    expect(d).toBeLessThan(111_400);
  });

  it('titik sama → 0', () => {
    expect(haversineMeters(-7.2575, 112.7521, -7.2575, 112.7521)).toBe(0);
  });

  it('Jakarta–Surabaya ≈ 660–700 km', () => {
    const d = haversineMeters(-6.2088, 106.8456, -7.2575, 112.7521);
    expect(d).toBeGreaterThan(600_000);
    expect(d).toBeLessThan(750_000);
  });
});

describe('checkGeofence', () => {
  const branch = { lat: -7.2575, lon: 112.7521, radius: 75 };
  it('di dalam radius (18 m) → inside', () => {
    const r = checkGeofence(-7.2574, 112.7522, branch.lat, branch.lon, branch.radius);
    expect(r.inside).toBe(true);
    expect(r.distanceM).toBeLessThan(75);
  });

  it('di luar radius (105 m, batas 100 m) → outside', () => {
    // ~105 m ke utara: 105/111320 derajat ≈ 0.000943
    const r = checkGeofence(branch.lat + 0.00095, branch.lon, branch.lat, branch.lon, 100);
    expect(r.inside).toBe(false);
    expect(r.distanceM).toBeGreaterThan(100);
  });

  it('buffer akurasi mengurangi radius efektif', () => {
    const r = checkGeofence(branch.lat + 0.0007, branch.lon, branch.lat, branch.lon, 75, 10);
    // jarak ~78 m; 78 - 10 = 68 <= 75 → inside dengan buffer, tapi tanpa buffer outside
    const r2 = checkGeofence(branch.lat + 0.0007, branch.lon, branch.lat, branch.lon, 75, 0);
    expect(r2.inside).toBe(false);
    expect(r.inside).toBe(true);
  });
});

describe('impossible travel', () => {
  it('Jakarta→Surabaya dalam 1 jam → mustahil (>120 km/jam)', () => {
    const prev = new Date('2026-10-16T07:00:00+07:00');
    const cur = new Date('2026-10-16T08:00:00+07:00');
    expect(isImpossibleTravel(-6.2088, 106.8456, prev, -7.2575, 112.7521, cur)).toBe(true);
  });

  it('perpindahan 5 km dalam 1 jam → wajar', () => {
    const prev = new Date('2026-10-16T07:00:00+07:00');
    const cur = new Date('2026-10-16T08:00:00+07:00');
    expect(isImpossibleTravel(-7.2575, 112.7521, prev, -7.26, 112.8, cur)).toBe(false);
    expect(travelSpeedKmh(-7.2575, 112.7521, prev, -7.26, 112.8, cur)).toBeLessThan(120);
  });
});
