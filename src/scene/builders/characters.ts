import * as THREE from 'three';
import { LEG_LENGTH, REST_ARM_Z } from '../constants';
import type { CharacterParts, RoomEntry } from '../types';

export function buildCharacter(opts: {
  shirt: string;
  pants: string;
  sleeves: boolean;
  badge?: string;
  face?: boolean;
}): CharacterParts {
  const group = new THREE.Group();

  const shirtMat = new THREE.MeshStandardMaterial({ color: opts.shirt, roughness: 0.6 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: opts.pants, roughness: 0.7 });
  const skinMat = new THREE.MeshStandardMaterial({ color: '#fed7aa', roughness: 0.6 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.85, 0.38), shirtMat);
  torso.position.y = 1.05;
  torso.castShadow = true;
  group.add(torso);

  if (opts.badge) {
    const patch = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.14, 0.03),
      new THREE.MeshStandardMaterial({ color: opts.badge, roughness: 0.4 })
    );
    patch.position.set(0.17, 0.17, 0.2);
    torso.add(patch);
  }

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.52, 0.52), skinMat);
  head.position.y = 1.78;
  head.castShadow = true;
  group.add(head);

  if (opts.face) {
    // Mata kecil agar arah pandang & gerakan kepala terbaca.
    const eyeMat = new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.4 });
    const eyeGeo = new THREE.BoxGeometry(0.07, 0.09, 0.03);
    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.12, 0.05, 0.265);
    head.add(leftEye);
    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(0.12, 0.05, 0.265);
    head.add(rightEye);
  }

  // Kaki: pivot di pinggul (y=0.62), mesh digeser ke bawah dari pivot
  // sehingga putaran terjadi di sendi, bukan di tengah paha.
  const legGeo = new THREE.BoxGeometry(0.24, LEG_LENGTH, 0.26);
  const makeLeg = (x: number): THREE.Group => {
    const pivot = new THREE.Group();
    pivot.position.set(x, LEG_LENGTH, 0);
    const mesh = new THREE.Mesh(legGeo, pantsMat);
    mesh.position.y = -LEG_LENGTH / 2;
    mesh.castShadow = true;
    pivot.add(mesh);
    group.add(pivot);
    return pivot;
  };
  const leftLeg = makeLeg(-0.17);
  const rightLeg = makeLeg(0.17);

  // Lengan: pivot di bahu (y=1.38).
  const armMat = opts.sleeves ? shirtMat : skinMat;
  const armGeo = new THREE.BoxGeometry(0.2, 0.65, 0.22);
  const makeArm = (x: number): THREE.Group => {
    const pivot = new THREE.Group();
    pivot.position.set(x, 1.38, 0);
    const mesh = new THREE.Mesh(armGeo, armMat);
    mesh.position.y = -0.33;
    mesh.castShadow = true;
    pivot.add(mesh);
    pivot.rotation.z = x < 0 ? -REST_ARM_Z : REST_ARM_Z;
    group.add(pivot);
    return pivot;
  };
  const leftArm = makeArm(-0.44);
  const rightArm = makeArm(0.44);

  return { group, head, torso, leftArm, rightArm, leftLeg, rightLeg };
}

/**
 * Kumpulkan material karakter supaya ikut crossfade bersama ruangnya.
 * Tanpa ini karakter akan mendadak muncul/hilang saat group.visible berubah.
 */
export function collectCharacterMats(parts: CharacterParts): RoomEntry['mats'] {
  const result: RoomEntry['mats'] = [];
  const seen = new Set<THREE.Material>();
  parts.group.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const list = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const m of list) {
      if (m instanceof THREE.MeshStandardMaterial && !seen.has(m)) {
        seen.add(m);
        result.push({ mat: m, base: m.color.clone(), opacity: m.opacity });
      }
    }
  });
  return result;
}

/** Pose duduk: kaki maju menyentuh lantai, lengan di pangkuan. */
export function applySittingPose(p: CharacterParts): void {
  const legAngle = -0.84; // ±48° — telapak hampir menyentuh lantai
  p.leftLeg.rotation.x = legAngle;
  p.rightLeg.rotation.x = legAngle;
  p.leftArm.rotation.x = -0.4;
  p.rightArm.rotation.x = -0.4;
  p.leftArm.rotation.z = -REST_ARM_Z;
  p.rightArm.rotation.z = REST_ARM_Z;
}
