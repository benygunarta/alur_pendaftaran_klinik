import * as THREE from 'three';

type AddBox = (
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  mat: THREE.Material,
  cast?: boolean
) => THREE.Mesh;

export function buildFurniture(
  index: number,
  accentMat: THREE.Material,
  wallMat: THREE.Material,
  room: THREE.Group
): void {
  const box: AddBox = (w, h, d, x, y, z, mat, cast = true) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    room.add(mesh);
    return mesh;
  };

  if (index === 0) {
    // Ruangan 1: Loket Pendaftaran + Kiosk Antrean
    box(4.8, 1.1, 1.1, -1.2, 0.65, -2.8, wallMat);
    box(4.9, 0.12, 1.2, -1.2, 1.25, -2.8, accentMat, false);
    box(0.7, 1.35, 0.5, 2.8, 0.75, -2.5, wallMat);
    const kioskScreen = box(0.6, 0.45, 0.08, 2.8, 1.35, -2.22, accentMat, false);
    kioskScreen.rotation.x = -0.25;
    // Printer tiket kecil di atas loket.
    const printerMat = new THREE.MeshStandardMaterial({ color: '#475569', roughness: 0.6 });
    box(0.4, 0.26, 0.32, -2.6, 1.44, -2.8, printerMat);
    box(0.26, 0.02, 0.2, -2.6, 1.58, -2.8, wallMat, false);
  } else if (index === 1) {
    // Ruangan 2: Ruang Tunggu + Meja Skrining
    const chairMat = new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.6 });
    for (let i = 0; i < 3; i++) {
      box(1.1, 0.45, 0.9, -2.5 + i * 1.4, 0.35, -2.4, chairMat);
      box(1.1, 0.55, 0.18, -2.5 + i * 1.4, 0.75, -2.76, accentMat);
    }
    box(2.4, 0.95, 1.1, 2.5, 0.58, -1.5, wallMat);
    // Timbangan berdiri di sudut belakang.
    box(0.55, 0.1, 0.55, 4.6, 0.21, -4.2, wallMat);
    box(0.1, 1.1, 0.1, 4.6, 0.81, -4.4, wallMat);
    box(0.32, 0.24, 0.1, 4.6, 1.42, -4.4, accentMat, false);
    // Monitor tanda vital di meja skrining.
    box(0.5, 0.4, 0.16, 2.9, 1.255, -1.85, wallMat);
    const vitalScreen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.42, 0.32),
      new THREE.MeshBasicMaterial({ color: '#7dd3fc', toneMapped: false })
    );
    vitalScreen.position.set(2.9, 1.255, -1.76);
    room.add(vitalScreen);
  } else if (index === 2) {
    // Ruangan 3: Poliklinik
    box(3.2, 0.9, 1.3, -0.5, 0.55, -2.2, wallMat);
    box(3.25, 0.1, 1.35, -0.5, 1.02, -2.2, accentMat, false);
    box(1.2, 0.75, 0.12, -0.5, 1.4, -2.65, accentMat, false);
    // Tempat periksa (exam bed) di sudut kanan belakang.
    box(1.7, 0.45, 0.85, 3.6, 0.385, -3.6, wallMat);
    box(1.7, 0.12, 0.85, 3.6, 0.67, -3.6, accentMat, false);
    box(0.4, 0.1, 0.5, 4.3, 0.79, -3.6, wallMat, false);
    // Lemari dokter dengan lambang salib di dinding kiri.
    box(0.5, 1.7, 1.1, -5.1, 1.01, -3.8, wallMat);
    box(0.05, 0.44, 0.16, -4.84, 1.35, -3.8, accentMat, false);
    box(0.05, 0.16, 0.44, -4.84, 1.35, -3.8, accentMat, false);
  } else {
    // Ruangan 4: Farmasi & Kasir
    for (let row = 0; row < 2; row++) {
      box(3.6, 1.8, 0.6, -1.5 + row * 4.2, 1.0, -4.4, wallMat);
    }
    box(4.5, 1.05, 1.15, 0, 0.62, -1.6, wallMat);
    box(4.55, 0.12, 1.2, 0, 1.18, -1.6, accentMat, false);
    // Mesin kasir kecil di konter.
    box(0.45, 0.3, 0.35, 1.7, 1.39, -1.6, wallMat);
    box(0.3, 0.2, 0.05, 1.7, 1.64, -1.72, accentMat, false);
    buildMedicineBoxes(room);
  }
}

/** Kotak obat berwarna di rak farmasi (instanced — dioptimalkan). */
export function buildMedicineBoxes(room: THREE.Group): void {
  const palette = ['#38bdf8', '#f472b6', '#fbbf24', '#a78bfa', '#34d399', '#f87171'];
  const cols = 5;
  const rows = 2;
  const shelfCenters = [-1.5, 2.7];
  const count = shelfCenters.length * cols * rows;

  const geo = new THREE.BoxGeometry(0.3, 0.34, 0.22);
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.55 });
  const instanced = new THREE.InstancedMesh(geo, mat, count);

  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  let i = 0;
  shelfCenters.forEach((cx) => {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        dummy.position.set(cx - 1.575 + c * 0.35, 0.45 + r * 0.55, -4.01);
        dummy.updateMatrix();
        instanced.setMatrixAt(i, dummy.matrix);
        color.set(palette[(i + r) % palette.length]);
        instanced.setColorAt(i, color);
        i++;
      }
    }
  });
  instanced.instanceMatrix.needsUpdate = true;
  if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true;
  instanced.castShadow = false;
  instanced.receiveShadow = false;
  room.add(instanced);
}
