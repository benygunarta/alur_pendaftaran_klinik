import * as THREE from 'three';
import { QUEUE_STEPS, getCorridor } from '../../data/queueSteps';
import { FLOOR_TOP } from '../constants';
import type { CorridorMark, RoutePlan } from './types';

/**
 * Susun jalur dari ruangan asal ke tujuan. Koridor didefinisikan sekali dan
 * dibalik untuk arah mundur, jadi 4→3 tidak pernah "muter" ke titik awal
 * jalur 3→4. Untuk lompat jauh (mis. 1→4), semua koridor dan waypoint
 * perantara dirangkai agar pasien benar-benar berjalan berurutan.
 *
 * `instant` (replay/klik tab yang sama) menghasilkan jalur lokal tanpa koridor.
 * `current` dipakai untuk anti-teleport: bila jalur baru jauh dari posisi
 * sekarang, titik sekarang disisipkan di depan.
 */
export function buildRoute(
  stepIndex: number,
  fromIndex: number,
  instant: boolean,
  current: THREE.Vector3
): RoutePlan {
  const safeIndex = Math.max(0, Math.min(stepIndex, QUEUE_STEPS.length - 1));
  const step = QUEUE_STEPS[safeIndex];

  const toVector = (v: [number, number, number]) =>
    new THREE.Vector3(v[0], v[1] + FLOOR_TOP, v[2]);
  const control: THREE.Vector3[] = [];
  /** Indeks titik kontrol terakhir sebelum waypoint ruangan tujuan. */
  let corridorEndIndex = -1;
  const corridorMarks: CorridorMark[] = [];
  const addPoint = (v: THREE.Vector3) => {
    const last = control[control.length - 1];
    if (!last || last.distanceToSquared(v) > 0.0025) control.push(v);
  };
  const addAll = (points: [number, number, number][]) => {
    for (const p of points) addPoint(toVector(p));
  };

  /** Ruangan yang dilalui jalur, dipakai updateRoomVisibility(). */
  const routeRooms: number[] = [];
  const markRoom = (index: number) => {
    if (routeRooms[routeRooms.length - 1] !== index) routeRooms.push(index);
  };

  if (instant || fromIndex === safeIndex) {
    // Tanpa koridor: replay / klik tab yang sama → kembali ke awal ruangan.
    addAll(step.waypoints);
    markRoom(safeIndex);
  } else {
    const dir = safeIndex > fromIndex ? 1 : -1;
    markRoom(fromIndex);
    for (let i = fromIndex; i !== safeIndex; i += dir) {
      const markStart = control.length;
      addAll(getCorridor(i, i + dir) ?? []);
      corridorEndIndex = control.length - 1;
      if (corridorEndIndex >= markStart) {
        corridorMarks.push({
          from: i,
          to: i + dir,
          startIndex: markStart,
          endIndex: corridorEndIndex,
        });
      }
      if (i + dir !== safeIndex) {
        addAll(QUEUE_STEPS[i + dir].waypoints);
        markRoom(i + dir);
      }
    }
    addAll(step.waypoints);
    markRoom(safeIndex);
  }

  // Anti-teleport: mulai dari posisi sekarang bila jalur baru jauh.
  if (!instant && control.length > 0) {
    const flat = new THREE.Vector3(current.x, FLOOR_TOP, current.z);
    if (flat.distanceToSquared(control[0]) > 0.16) {
      control.unshift(flat);
      if (corridorEndIndex >= 0) corridorEndIndex++;
      for (const mark of corridorMarks) {
        mark.startIndex++;
        mark.endIndex++;
      }
    }
  }

  return { control, corridorEndIndex, corridorMarks, routeRooms };
}
