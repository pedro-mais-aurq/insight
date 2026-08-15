import {
  ANALYSIS_ERROR_CODES,
  AnalysisError
} from "./analysis-errors.js";

export function normalizeGeometry(object3D) {
  if (!object3D || typeof object3D.traverse !== "function") {
    throw new AnalysisError(ANALYSIS_ERROR_CODES.NO_GEOMETRY);
  }

  object3D.updateMatrixWorld(true);

  const meshes = [];
  let meshCount = 0;
  let rawVertexCount = 0;
  let triangleCount = 0;
  let valueCount = 0;

  object3D.traverse((child) => {
    if (!child.isMesh || !child.geometry) {
      return;
    }

    const position = child.geometry.getAttribute("position");

    if (!position || position.count === 0) {
      return;
    }

    meshCount += 1;
    rawVertexCount += position.count;
    const normalizedPositionCount = child.geometry.index?.count ?? position.count;

    if (normalizedPositionCount % 3 !== 0) {
      throw new AnalysisError(ANALYSIS_ERROR_CODES.NO_TRIANGLES);
    }

    meshes.push(child);
    valueCount += normalizedPositionCount * 3;
    triangleCount += normalizedPositionCount / 3;
  });

  if (meshCount === 0 || valueCount === 0) {
    throw new AnalysisError(ANALYSIS_ERROR_CODES.NO_GEOMETRY);
  }

  if (triangleCount === 0) {
    throw new AnalysisError(ANALYSIS_ERROR_CODES.NO_TRIANGLES);
  }

  const positions = new Float32Array(valueCount);
  let writeOffset = 0;

  for (const mesh of meshes) {
    const geometry = mesh.geometry.index
      ? mesh.geometry.toNonIndexed()
      : mesh.geometry.clone();

    geometry.applyMatrix4(mesh.matrixWorld);
    const normalizedPosition = geometry.getAttribute("position");

    for (let index = 0; index < normalizedPosition.count; index += 1) {
      positions[writeOffset] = normalizedPosition.getX(index);
      positions[writeOffset + 1] = normalizedPosition.getY(index);
      positions[writeOffset + 2] = normalizedPosition.getZ(index);
      writeOffset += 3;
    }

    geometry.dispose();
  }

  return {
    positions,
    meshCount,
    rawVertexCount,
    triangleCount
  };
}
