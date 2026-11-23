import * as THREE from 'three';
import type { Mode } from '../types';

/** Kamera mengikuti pasien di koridor, lalu terkunci ke ruangan tujuan. */
export function updateCameraTarget(
  mode: Mode,
  patientPos: THREE.Vector3,
  targetLookAt: THREE.Vector3,
  stepRoomCenter: [number, number, number]
): void {
  if (mode === 'transition') {
    targetLookAt.copy(patientPos);
  } else {
    targetLookAt.set(...stepRoomCenter);
  }
}

/** Zoom diblend per frame; mengembalikan status apakah animasi masih jalan. */
export function updateZoom(
  camera: THREE.OrthographicCamera,
  targetZoom: number,
  reducedMotion: boolean,
  delta: number,
  zoomAnimating: boolean
): boolean {
  if (!zoomAnimating) return false;
  const k = reducedMotion ? 1 : 1 - Math.exp(-6 * delta);
  camera.zoom += (targetZoom - camera.zoom) * k;
  const done = Math.abs(camera.zoom - targetZoom) < 0.02;
  if (done) camera.zoom = targetZoom;
  camera.updateProjectionMatrix();
  return !done;
}

/** Panah penanda ruangan aktif: mengambang & berputar pelan. */
export function updateActiveMarker(
  arrow: THREE.Group,
  elapsed: number,
  reducedMotion: boolean
): void {
  const t = reducedMotion ? 0 : elapsed;
  arrow.position.y = 4 + Math.sin(t * 2) * 0.18;
  arrow.rotation.y = t * 0.8;
}
