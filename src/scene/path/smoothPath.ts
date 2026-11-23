import * as THREE from 'three';
import type { CorridorMark, SmoothPathResult } from './types';

/**
 * Ubah polyline menjadi sampel halus. Setiap tikungan dipotong dengan
 * kurva Beziera kuadrat (radius maksimal 0.55) supaya pasien tidak berbalik
 * 90° secara instan. Jarak dihitung kumulatif agar kecepatan konstan.
 */
export function buildSmoothPath(
  control: THREE.Vector3[],
  corridorEndIndex: number,
  corridorMarks: CorridorMark[] = []
): SmoothPathResult {
  const pathSamples: THREE.Vector3[] = [];
  if (control.length === 0) {
    return {
      pathSamples,
      pathDistances: [],
      pathLength: 0,
      transitionLength: 0,
      corridorRanges: [],
      travel: 0,
    };
  }

  const push = (v: THREE.Vector3) => {
    const last = pathSamples[pathSamples.length - 1];
    if (!last || last.distanceToSquared(v) > 1e-6) pathSamples.push(v.clone());
  };
  push(control[0]);

  for (let i = 1; i < control.length - 1; i++) {
    const prev = control[i - 1];
    const cur = control[i];
    const next = control[i + 1];
    const inDir = new THREE.Vector3().subVectors(cur, prev);
    const outDir = new THREE.Vector3().subVectors(next, cur);
    const inLen = inDir.length();
    const outLen = outDir.length();
    if (inLen < 1e-4 || outLen < 1e-4) {
      push(cur);
      continue;
    }
    inDir.divideScalar(inLen);
    outDir.divideScalar(outLen);
    if (inDir.dot(outDir) > 0.985) {
      push(cur); // hampir lurus, tidak perlu dibulatkan
      continue;
    }

    const radius = Math.min(0.55, inLen * 0.32, outLen * 0.32);
    const entry = new THREE.Vector3().copy(cur).addScaledVector(inDir, -radius);
    const exit = new THREE.Vector3().copy(cur).addScaledVector(outDir, radius);
    push(entry);
    for (let s = 1; s <= 5; s++) {
      const t = s / 5;
      const a = 1 - t;
      push(
        new THREE.Vector3()
          .addScaledVector(entry, a * a)
          .addScaledVector(cur, 2 * a * t)
          .addScaledVector(exit, t * t)
      );
    }
  }
  push(control[control.length - 1]);

  const pathDistances = [0];
  for (let i = 1; i < pathSamples.length; i++) {
    pathDistances[i] =
      pathDistances[i - 1] + pathSamples[i].distanceTo(pathSamples[i - 1]);
  }
  const pathLength = pathDistances[pathDistances.length - 1] ?? 0;

  const transitionLength =
    corridorEndIndex >= 0 && corridorEndIndex < control.length
      ? distanceAtControl(pathSamples, pathDistances, control[corridorEndIndex])
      : 0;

  const corridorRanges = corridorMarks
    .filter((mark) => mark.startIndex < control.length && mark.endIndex < control.length)
    .map((mark) => ({
      from: mark.from,
      to: mark.to,
      start: distanceAtControl(pathSamples, pathDistances, control[mark.startIndex]),
      end: distanceAtControl(pathSamples, pathDistances, control[mark.endIndex]),
    }))
    .filter((range) => range.end > range.start);

  return {
    pathSamples,
    pathDistances,
    pathLength,
    transitionLength,
    corridorRanges,
    travel: 0,
  };
}

/** Jarak pada jalur halus yang paling dekat dengan sebuah titik kontrol. */
export function distanceAtControl(
  pathSamples: THREE.Vector3[],
  pathDistances: number[],
  point: THREE.Vector3
): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < pathSamples.length; i++) {
    const d = pathSamples[i].distanceToSquared(point);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return pathDistances[best] ?? 0;
}

/** Ambil posisi & arah jalur pada jarak tertentu (binary search, tanpa alokasi). */
export function samplePath(
  pathSamples: THREE.Vector3[],
  pathDistances: number[],
  pathLength: number,
  distance: number,
  outPos: THREE.Vector3,
  outDir: THREE.Vector3
): void {
  const n = pathSamples.length;
  if (n === 0) return;
  if (n === 1) {
    outPos.copy(pathSamples[0]);
    outDir.set(0, 0, 1);
    return;
  }
  const d = Math.max(0, Math.min(distance, pathLength));
  let lo = 0;
  let hi = n - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (pathDistances[mid] <= d) lo = mid;
    else hi = mid;
  }
  const d0 = pathDistances[lo];
  const d1 = pathDistances[hi];
  const t = d1 > d0 ? (d - d0) / (d1 - d0) : 0;
  outPos.lerpVectors(pathSamples[lo], pathSamples[hi], t);
  outDir.subVectors(pathSamples[hi], pathSamples[lo]);
  if (outDir.lengthSq() < 1e-8 && lo > 0) {
    outDir.subVectors(pathSamples[lo], pathSamples[lo - 1]);
  }
  outDir.normalize();
}
