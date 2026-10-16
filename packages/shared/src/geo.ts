/**
 * Util geospasial murni (tanpa dependensi).
 * Rumus Haversine sesuai PRD Modul 1 dengan R = 6.371.000 m.
 */

export const EARTH_RADIUS_M = 6_371_000;

/** Ambang heuristik anti-fraud sesuai PRD. */
export const MAX_GPS_ACCURACY_M = 100;
export const MAX_IMPOSSIBLE_SPEED_KMH = 120;
export const MAX_CLOCK_SKEW_SEC = 60;

export function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Jarak permukaan bumi (meter) antara dua titik koordinat. */
export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

export interface GeofenceResult {
  inside: boolean;
  distanceM: number;
}

/**
 * Cek geofencing cabang. accuracyBufferM dikurangkan dari radius
 * (buffer akurasi GPS) sesuai aturan validasi PRD.
 */
export function checkGeofence(
  userLat: number,
  userLon: number,
  branchLat: number,
  branchLon: number,
  radiusM: number,
  accuracyBufferM = 0,
): GeofenceResult {
  const distanceM = haversineMeters(userLat, userLon, branchLat, branchLon);
  return { inside: distanceM - accuracyBufferM <= radiusM, distanceM };
}

/**
 * Kecepatan perpindahan (km/jam) antara dua titik + waktu.
 * Dipakai untuk deteksi "impossible travel".
 */
export function travelSpeedKmh(
  prevLat: number,
  prevLon: number,
  prevAt: Date,
  curLat: number,
  curLon: number,
  curAt: Date,
): number {
  const hours = (curAt.getTime() - prevAt.getTime()) / 3_600_000;
  if (hours <= 0) return 0;
  return haversineMeters(prevLat, prevLon, curLat, curLon) / 1000 / hours;
}

export function isImpossibleTravel(
  prevLat: number,
  prevLon: number,
  prevAt: Date,
  curLat: number,
  curLon: number,
  curAt: Date,
): boolean {
  return (
    travelSpeedKmh(prevLat, prevLon, prevAt, curLat, curLon, curAt) >
    MAX_IMPOSSIBLE_SPEED_KMH
  );
}
