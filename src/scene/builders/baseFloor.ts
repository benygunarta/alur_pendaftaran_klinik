import * as THREE from 'three';
import { FLOOR_TOP } from '../constants';

export function buildBaseFloor(scene: THREE.Scene): void {
  // Lantai dasar sengaja dibuat sangat luas (jauh melebihi pandangan kamera)
  // sehingga tepi kotaknya tidak pernah terlihat. Batas pandangan kini hanya
  // ditentukan oleh mask radial CSS, sehingga scene menyatu dengan halaman.
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(70, 0.6, 70),
    // Warna lantai disamakan dengan nuansa slate halaman agar tepinya
    // menyatu saat kanvas memudar (mask radial).
    new THREE.MeshStandardMaterial({ color: '#eef2f7', roughness: 0.9 })
  );
  base.position.y = FLOOR_TOP - 0.3;
  base.receiveShadow = true;
  scene.add(base);
}
