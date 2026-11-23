import type * as THREE from 'three';

/** Rentang indeks control point yang berasal dari satu koridor. */
export interface CorridorMark {
  from: number;
  to: number;
  startIndex: number;
  endIndex: number;
}

/** Rentang jarak pada jalur halus yang masih berada di koridor. */
export interface CorridorRange {
  from: number;
  to: number;
  start: number;
  end: number;
}

/** Hasil penyusunan jalur dari ruangan asal ke tujuan. */
export interface RoutePlan {
  control: THREE.Vector3[];
  corridorEndIndex: number;
  corridorMarks: CorridorMark[];
  routeRooms: number[];
}

/** Hasil pembulatan tikungan + parameterisasi panjang busur. */
export interface SmoothPathResult {
  pathSamples: THREE.Vector3[];
  pathDistances: number[];
  pathLength: number;
  transitionLength: number;
  corridorRanges: CorridorRange[];
  travel: number;
}
