import type * as THREE from 'three';

export interface CharacterParts {
  group: THREE.Group;
  head: THREE.Mesh;
  torso: THREE.Mesh;
  /** Pivot di bahu — mesh lengan digeser ke bawah dari pivot. */
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  /** Pivot di pinggul — mesh kaki digeser ke bawah dari pivot. */
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
}

export interface StaffEntry {
  parts: CharacterParts;
  baseY: number;
  phase: number;
}

/** Material satu ruangan beserta warna/opasitas dasarnya, untuk crossfade transisi. */
export interface RoomEntry {
  group: THREE.Group;
  /** Posisi Y asli ruangan, dipakai saat menggeser lantai anti-z-fighting. */
  baseY: number;
  mats: { mat: THREE.MeshStandardMaterial; base: THREE.Color; opacity: number }[];
  dim: number;
}

/** Layar papan nomor antrean yang bisa diperbarui angkanya. */
export interface QueueDisplay {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  number: number;
  prefix: string;
}
