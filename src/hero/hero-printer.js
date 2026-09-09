import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

const COLORS = {
  frame: 0x242424,
  frameHighlight: 0x4f4f4f,
  bed: 0x141414,
  bedSurface: 0x555555,
  print: 0xf2a36b,
  nozzle: 0xf3c49b,
  filament: 0xffc78d
};

const PRINT_LAYERS = 14;
const LAYER_HEIGHT = 0.11;
const PRINT_WIDTH = 1.12;
const PRINT_DEPTH = 1.12;
const PRINT_HEIGHT = PRINT_LAYERS * LAYER_HEIGHT;
const CYCLE_SECONDS = 10;

export function initHeroPrinter(container) {
  if (!container || !canUseWebGL()) {
    container?.setAttribute("data-hero-printer-fallback", "");
    if (container) container.dataset.heroPrinterState = "fallback";
    return;
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
  camera.position.set(6.4, 5.1, 7.1);
  camera.lookAt(0, 2.15, 0);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance"
    });
  } catch {
    container.setAttribute("data-hero-printer-fallback", "");
    container.dataset.heroPrinterState = "fallback";
    return;
  }

  const mobilePixelRatioLimit = window.matchMedia?.("(max-width: 600px)").matches
    ? 1.25
    : 1.75;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobilePixelRatioLimit));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.localClippingEnabled = true;
  container.appendChild(renderer.domElement);

  const sceneRoot = new THREE.Group();
  sceneRoot.rotation.y = -0.17;
  scene.add(sceneRoot);

  addLights(scene);
  buildPrinter(sceneRoot);

  const printLayers = buildPrintObject(sceneRoot);
  const movingHead = sceneRoot.getObjectByName("moving-head");
  const filament = createFilament();
  filament.name = "filament";
  sceneRoot.add(filament);
  let printedModel = null;
  const prefersReducedMotion = window.matchMedia?.(
    "(prefers-reduced-motion: reduce)"
  ).matches;
  const resizeObserver = typeof ResizeObserver === "function"
    ? new ResizeObserver(() => resize())
    : null;
  const viewportObserver = typeof IntersectionObserver === "function"
    ? new IntersectionObserver(([entry]) => {
        inViewport = entry?.isIntersecting !== false;
        syncAnimation();
      }, { rootMargin: "120px 0px" })
    : null;
  const clock = new THREE.Clock();
  let animationFrame = 0;
  let disposed = false;
  let inViewport = true;
  let pageVisible = !document.hidden;

  resizeObserver?.observe(container);
  if (!resizeObserver) window.addEventListener("resize", resize);
  viewportObserver?.observe(container);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  renderer.domElement.addEventListener("webglcontextlost", handleContextLost, {
    once: true
  });
  resize();
  container.removeAttribute("data-hero-printer-fallback");
  container.dataset.heroPrinterState = "ready";

  loadReferenceCar()
    .then((model) => {
      if (disposed) {
        disposeObject(model);
        return;
      }
      printedModel = model;
      sceneRoot.add(model);
      printLayers.forEach((layer) => {
        layer.visible = false;
      });
      if (prefersReducedMotion) {
        updateScene(0.78, movingHead, filament, printLayers, printedModel);
        renderer.render(scene, camera);
      }
    })
    .catch(() => {
      // The procedural piece remains as a lightweight fallback if the model
      // cannot be loaded in a restricted or offline environment.
    });

  if (prefersReducedMotion) {
    updateScene(0.78, movingHead, filament, printLayers, printedModel);
    renderer.render(scene, camera);
    return () => dispose();
  }

  const animate = () => {
    animationFrame = 0;
    if (disposed || !inViewport || !pageVisible) return;
    const elapsed = clock.getElapsedTime();
    const cycle = (elapsed % CYCLE_SECONDS) / CYCLE_SECONDS;
    const buildProgress = getBuildProgress(cycle);
    updateScene(
      buildProgress,
      movingHead,
      filament,
      printLayers,
      printedModel
    );
    renderer.render(scene, camera);
    animationFrame = requestAnimationFrame(animate);
  };

  syncAnimation();

  return () => dispose();

  function resize() {
    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }

  function syncAnimation() {
    if (prefersReducedMotion || disposed) return;
    if (inViewport && pageVisible && animationFrame === 0) {
      animationFrame = requestAnimationFrame(animate);
    } else if ((!inViewport || !pageVisible) && animationFrame !== 0) {
      cancelAnimationFrame(animationFrame);
      animationFrame = 0;
    }
  }

  function handleVisibilityChange() {
    pageVisible = !document.hidden;
    syncAnimation();
  }

  function handleContextLost(event) {
    event.preventDefault();
    container.setAttribute("data-hero-printer-fallback", "");
    container.dataset.heroPrinterState = "fallback";
    dispose();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    resizeObserver?.disconnect();
    viewportObserver?.disconnect();
    window.removeEventListener("resize", resize);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    renderer.domElement.removeEventListener("webglcontextlost", handleContextLost);
    scene.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
      if (object.material) {
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        materials.forEach((material) => material.dispose());
      }
    });
    renderer.dispose();
    renderer.domElement.remove();
  }
}

function canUseWebGL() {
  if (typeof document === "undefined") return false;
  const canvas = document.createElement("canvas");
  return Boolean(
    window.WebGLRenderingContext &&
      (canvas.getContext("webgl") || canvas.getContext("experimental-webgl"))
  );
}

function addLights(scene) {
  scene.add(new THREE.HemisphereLight(0xffffff, 0x080808, 2.2));

  const keyLight = new THREE.DirectionalLight(0xffffff, 3.6);
  keyLight.position.set(4, 8, 5);
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0xffbd8b, 1.7);
  rimLight.position.set(-5, 4, -4);
  scene.add(rimLight);
}

function buildPrinter(parent) {
  const frameMaterial = new THREE.MeshStandardMaterial({
    color: COLORS.frame,
    roughness: 0.35,
    metalness: 0.72
  });
  const highlightMaterial = new THREE.MeshStandardMaterial({
    color: COLORS.frameHighlight,
    roughness: 0.3,
    metalness: 0.78
  });
  const bedMaterial = new THREE.MeshStandardMaterial({
    color: COLORS.bed,
    roughness: 0.44,
    metalness: 0.45
  });
  const surfaceMaterial = new THREE.MeshStandardMaterial({
    color: COLORS.bedSurface,
    roughness: 0.72,
    metalness: 0.22
  });

  addBox(parent, [4.6, 0.38, 3.55], [0, 0.19, 0], frameMaterial, 0.08);
  addBox(parent, [3.45, 0.09, 2.55], [0, 0.43, 0], bedMaterial, 0.035);
  addBox(parent, [3.08, 0.035, 2.18], [0, 0.5, 0], surfaceMaterial, 0.018);

  [-1, 1].forEach((x) => {
    [-1, 1].forEach((z) => {
      addBox(
        parent,
        [0.18, 4.1, 0.18],
        [x * 2.04, 2.35, z * 1.5],
        frameMaterial,
        0.035
      );
    });
  });

  addBox(parent, [4.25, 0.2, 0.2], [0, 4.32, -1.5], highlightMaterial, 0.04);
  addBox(parent, [4.25, 0.2, 0.2], [0, 4.32, 1.5], frameMaterial, 0.04);
  addBox(parent, [0.2, 0.2, 3.1], [-2.04, 4.32, 0], frameMaterial, 0.04);
  addBox(parent, [0.2, 0.2, 3.1], [2.04, 4.32, 0], frameMaterial, 0.04);

  const gantry = new THREE.Group();
  gantry.position.y = 3.45;
  parent.add(gantry);
  addBox(gantry, [3.86, 0.14, 0.14], [0, 0, 0], highlightMaterial, 0.025);
  addBox(gantry, [3.86, 0.06, 0.22], [0, 0.14, 0], frameMaterial, 0.02);

  const movingHead = new THREE.Group();
  movingHead.name = "moving-head";
  gantry.add(movingHead);
  addBox(movingHead, [0.52, 0.48, 0.42], [0, -0.3, 0], frameMaterial, 0.08);
  addBox(movingHead, [0.22, 0.23, 0.28], [0, -0.66, 0], highlightMaterial, 0.04);

  const nozzle = new THREE.Mesh(
    new THREE.ConeGeometry(0.1, 0.2, 12),
    new THREE.MeshStandardMaterial({
      color: COLORS.nozzle,
      roughness: 0.28,
      metalness: 0.68
    })
  );
  nozzle.rotation.x = Math.PI;
  nozzle.position.y = -0.84;
  movingHead.add(nozzle);

  const statusLight = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 12, 8),
    new THREE.MeshStandardMaterial({
      color: COLORS.filament,
      emissive: COLORS.filament,
      emissiveIntensity: 2.8
    })
  );
  statusLight.position.set(0.17, -0.28, 0.22);
  movingHead.add(statusLight);
}

function buildPrintObject(parent) {
  const material = new THREE.MeshStandardMaterial({
    color: COLORS.print,
    roughness: 0.62,
    metalness: 0.05
  });
  const printObject = new THREE.Group();
  printObject.position.y = 0.54;
  parent.add(printObject);

  const layers = [];
  for (let index = 0; index < PRINT_LAYERS; index += 1) {
    const layer = new THREE.Mesh(
      new RoundedBoxGeometry(PRINT_WIDTH, LAYER_HEIGHT, PRINT_DEPTH, 3, 0.08),
      material
    );
    const taper = 1 - Math.max(0, index - 8) * 0.012;
    layer.scale.set(taper, 1, taper);
    layer.position.y = index * LAYER_HEIGHT + LAYER_HEIGHT / 2;
    layer.visible = false;
    printObject.add(layer);
    layers.push(layer);
  }

  return layers;
}

async function loadReferenceCar() {
  const { STLLoader } = await import("three/addons/loaders/STLLoader.js");
  const loader = new STLLoader();
  const geometry = await new Promise((resolve, reject) => {
    loader.load(
      new URL("../../assets/model/mclaren-720s-lite.stl", import.meta.url).href,
      resolve,
      undefined,
      reject
    );
  });

  geometry.computeVertexNormals();
  const model = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color: 0xd9a174,
      roughness: 0.58,
      metalness: 0.12
    })
  );
  model.name = "printed-reference-car";
  normalizeModelToBed(model);
  prepareModelForPrinting(model);
  return model;
}

function normalizeModelToBed(model) {
  // STL coordinates use Z as the build axis; the scene uses Y as vertical.
  model.rotation.x = -Math.PI / 2;
  const initialBounds = new THREE.Box3().setFromObject(model);
  const initialSize = initialBounds.getSize(new THREE.Vector3());
  const footprint = Math.max(initialSize.x, initialSize.z);
  const scale = footprint > 0 ? 1.72 / footprint : 0.01;
  model.scale.setScalar(scale);

  const scaledBounds = new THREE.Box3().setFromObject(model);
  const center = scaledBounds.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y += 0.54 - scaledBounds.min.y;
}

function prepareModelForPrinting(model) {
  model.updateMatrixWorld(true);
  const modelBounds = new THREE.Box3().setFromObject(model);
  const modelHeight = Math.max(modelBounds.max.y - modelBounds.min.y, 0.001);
  const printPlane = new THREE.Plane(
    new THREE.Vector3(0, -1, 0),
    modelBounds.min.y
  );
  model.userData.printPlane = printPlane;
  model.userData.printBottom = modelBounds.min.y;
  model.userData.printHeight = modelHeight;

  model.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = false;
    object.receiveShadow = false;
    object.userData.printBand = getPrintBand(object, modelBounds, modelHeight);

    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    materials.forEach((material) => {
      material.transparent = true;
      material.opacity = 1;
      material.depthWrite = true;
      material.clippingPlanes = [printPlane];
    });
  });
}

function getPrintBand(mesh, modelBounds, modelHeight) {
  const bounds = new THREE.Box3().setFromObject(mesh);
  return THREE.MathUtils.clamp(
    (bounds.min.y - modelBounds.min.y) / modelHeight,
    0,
    1
  );
}

function addBox(parent, size, position, material, radius) {
  const mesh = new THREE.Mesh(
    new RoundedBoxGeometry(...size, 3, radius),
    material
  );
  mesh.position.set(...position);
  parent.add(mesh);
  return mesh;
}

function updateScene(progress, movingHead, filament, layers, printedModel) {
  const visibleLayers = Math.min(
    PRINT_LAYERS,
    Math.max(0, Math.ceil(progress * PRINT_LAYERS))
  );
  layers.forEach((layer, index) => {
    layer.visible = !printedModel && index < visibleLayers;
  });
  updatePrintedModel(printedModel, progress);

  const printHeight = printedModel?.userData.printHeight ?? PRINT_HEIGHT;
  const headOffset = -2.1 + Math.max(progress * printHeight, 0.12);
  const sweep = progress * Math.PI * 9;
  movingHead.position.x = Math.sin(sweep) * 1.48;
  movingHead.position.z = Math.cos(sweep * 0.64) * 0.88;
  movingHead.position.y = headOffset;

  filament.visible = visibleLayers > 0;
  filament.position.set(
    movingHead.position.x,
    3.45 + movingHead.position.y - 0.78,
    movingHead.position.z
  );
  filament.scale.y = Math.max(0.15, progress * printHeight * 0.6);
}

function updatePrintedModel(model, progress) {
  if (!model) return;
  const reveal = Math.min(1, progress + 0.04);
  const printPlane = model.userData.printPlane;
  if (printPlane) {
    printPlane.constant =
      model.userData.printBottom + reveal * model.userData.printHeight;
  }
  model.visible = progress > 0.015;
  model.traverse((object) => {
    if (!object.isMesh) return;
    object.visible = model.visible && object.userData.printBand <= reveal;
  });
}

function createFilament() {
  const filament = new THREE.Mesh(
    new THREE.CylinderGeometry(0.026, 0.026, 1, 8),
    new THREE.MeshStandardMaterial({
      color: COLORS.filament,
      emissive: COLORS.filament,
      emissiveIntensity: 0.55,
      roughness: 0.5
    })
  );
  filament.scale.y = 0.15;
  return filament;
}

function getBuildProgress(cycle) {
  if (cycle < 0.8) return cycle / 0.8;
  const resetProgress = (cycle - 0.8) / 0.2;
  return 1 - resetProgress * resetProgress;
}

function disposeObject(object) {
  object.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (!child.material) return;
    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material];
    materials.forEach((material) => material.dispose());
  });
}
