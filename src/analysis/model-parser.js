import * as THREE from "three";
import { ThreeMFLoader } from "three/addons/loaders/3MFLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import {
  ANALYSIS_ERROR_CODES,
  AnalysisError
} from "./analysis-errors.js";
import { createUnknownUnit } from "./unit-converter.js";

const SUPPORTED_FORMATS = new Set(["stl", "obj", "3mf"]);

export async function parseModel(file, extension) {
  const format = normalizeFormat(extension);

  if (!file || typeof file.arrayBuffer !== "function") {
    throw new AnalysisError(ANALYSIS_ERROR_CODES.PARSE_FAILED);
  }

  try {
    const object3D = await parseByFormat(file, format);
    const meshCount = countMeshes(object3D);

    if (meshCount === 0) {
      throw new AnalysisError(ANALYSIS_ERROR_CODES.NO_GEOMETRY);
    }

    applyNeutralMaterials(object3D, format);

    return {
      format,
      object3D,
      meshCount,
      unit: createUnknownUnit()
    };
  } catch (error) {
    if (error instanceof AnalysisError) {
      throw error;
    }

    throw new AnalysisError(ANALYSIS_ERROR_CODES.PARSE_FAILED, {
      cause: error
    });
  }
}

async function parseByFormat(file, format) {
  if (format === "stl") {
    const geometry = new STLLoader().parse(await file.arrayBuffer());
    return new THREE.Mesh(geometry, createNeutralMaterial());
  }

  if (format === "obj") {
    const source = new TextDecoder().decode(await file.arrayBuffer());
    return new OBJLoader().parse(source);
  }

  return new ThreeMFLoader().parse(await file.arrayBuffer());
}

function normalizeFormat(extension) {
  const format = typeof extension === "string"
    ? extension.trim().toLowerCase()
    : "";

  if (!SUPPORTED_FORMATS.has(format)) {
    throw new AnalysisError(ANALYSIS_ERROR_CODES.UNSUPPORTED_STRUCTURE);
  }

  return format;
}

function countMeshes(object3D) {
  let count = 0;

  object3D.traverse((child) => {
    if (child.isMesh && child.geometry?.getAttribute("position")) {
      count += 1;
    }
  });

  return count;
}

function applyNeutralMaterials(object3D, format) {
  object3D.traverse((child) => {
    if (!child.isMesh) {
      return;
    }

    if (format === "obj") {
      disposeMaterial(child.material);
      child.material = createNeutralMaterial();
    }

    child.castShadow = false;
    child.receiveShadow = false;
  });
}

function createNeutralMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0xe7e7e7,
    roughness: 0.72,
    metalness: 0.04,
    side: THREE.DoubleSide
  });
}

function disposeMaterial(material) {
  const materials = Array.isArray(material) ? material : [material];
  materials.filter(Boolean).forEach((item) => item.dispose?.());
}
