import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { fitCameraToObject } from "./viewer-camera.js";

export function createModelViewer(container) {
  let scene = null;
  let camera = null;
  let renderer = null;
  let controls = null;
  let resizeObserver = null;
  let currentObject = null;

  function show(object3D) {
    dispose();
    initialize();
    currentObject = object3D;
    scene.add(currentObject);

    if (!fitCameraToObject(camera, controls, currentObject)) {
      throw new Error("VIEWER_EMPTY_OBJECT");
    }

    renderer.setAnimationLoop(() => {
      controls.update();
      renderer.render(scene, camera);
    });
  }

  function initialize() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0a);
    camera = new THREE.PerspectiveCamera(42, 1, 0.001, 10000);
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.replaceChildren(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = true;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x202020, 2.2));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.8);
    keyLight.position.set(4, 6, 5);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xffffff, 1.2);
    fillLight.position.set(-4, 1, -3);
    scene.add(fillLight);

    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();
  }

  function resize() {
    if (!renderer || !camera) {
      return;
    }

    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function dispose() {
    resizeObserver?.disconnect();
    resizeObserver = null;
    renderer?.setAnimationLoop(null);
    controls?.dispose();

    if (currentObject) {
      disposeObject(currentObject);
      currentObject.removeFromParent();
      currentObject = null;
    }

    renderer?.dispose();
    renderer?.domElement?.remove();
    scene = null;
    camera = null;
    renderer = null;
    controls = null;
  }

  return Object.freeze({ show, dispose });
}

function disposeObject(object3D) {
  object3D.traverse((child) => {
    if (!child.isMesh) {
      return;
    }

    child.geometry?.dispose();
    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material];

    materials.filter(Boolean).forEach((material) => {
      for (const value of Object.values(material)) {
        if (value?.isTexture) {
          value.dispose();
        }
      }

      material.dispose?.();
    });
  });
}
