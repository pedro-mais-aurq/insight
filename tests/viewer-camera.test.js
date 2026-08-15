import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { fitCameraToObject } from "../src/viewer/viewer-camera.js";

describe("fitCameraToObject", () => {
  it("enquadra o objeto e centraliza os controles", () => {
    const camera = new THREE.PerspectiveCamera(42, 1, 0.001, 10000);
    const controls = {
      target: new THREE.Vector3(),
      minDistance: 0,
      maxDistance: 0,
      update: vi.fn()
    };
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 6));

    expect(fitCameraToObject(camera, controls, mesh)).toBe(true);
    expect(controls.target.toArray()).toEqual([0, 0, 0]);
    expect(camera.position.length()).toBeGreaterThan(0);
    expect(camera.near).toBeGreaterThan(0);
    expect(camera.far).toBeGreaterThan(camera.near);
    expect(controls.minDistance).toBeGreaterThan(0);
    expect(controls.maxDistance).toBeGreaterThan(controls.minDistance);
    expect(controls.update).toHaveBeenCalledOnce();

    mesh.geometry.dispose();
  });

  it("não tenta enquadrar um objeto sem geometria", () => {
    const camera = new THREE.PerspectiveCamera();
    const controls = {
      target: new THREE.Vector3(),
      update: vi.fn()
    };

    expect(fitCameraToObject(camera, controls, new THREE.Group())).toBe(false);
    expect(controls.update).not.toHaveBeenCalled();
  });
});
