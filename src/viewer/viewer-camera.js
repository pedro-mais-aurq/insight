import * as THREE from "three";

export function fitCameraToObject(camera, controls, object3D, padding = 1.35) {
  const bounds = new THREE.Box3().setFromObject(object3D);

  if (bounds.isEmpty()) {
    return false;
  }

  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const maxDimension = Math.max(size.x, size.y, size.z);
  const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);
  const distance = Math.max(maxDimension / (2 * Math.tan(halfFov)), 0.01)
    * padding;
  const direction = new THREE.Vector3(1, 0.72, 1).normalize();

  camera.position.copy(center).addScaledVector(direction, distance);
  camera.near = Math.max(distance / 1000, 0.001);
  camera.far = Math.max(distance * 100, 100);
  camera.updateProjectionMatrix();
  controls.target.copy(center);
  controls.minDistance = Math.max(distance / 20, 0.001);
  controls.maxDistance = distance * 20;
  controls.update();
  return true;
}
