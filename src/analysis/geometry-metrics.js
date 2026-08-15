import { ANALYSIS_CONFIG } from "../config/analysis.config.js";
import {
  ANALYSIS_ERROR_CODES,
  ANALYSIS_WARNING_CODES,
  AnalysisError
} from "./analysis-errors.js";

export function analyzeGeometry(positions, config = ANALYSIS_CONFIG) {
  if (!ArrayBuffer.isView(positions) || positions.length === 0) {
    throw new AnalysisError(ANALYSIS_ERROR_CODES.NO_GEOMETRY);
  }

  if (positions.length % 9 !== 0) {
    throw new AnalysisError(ANALYSIS_ERROR_CODES.NO_TRIANGLES);
  }

  const triangleCount = positions.length / 9;

  if (triangleCount === 0) {
    throw new AnalysisError(ANALYSIS_ERROR_CODES.NO_TRIANGLES);
  }

  const bounds = createEmptyBounds();
  let surfaceArea = 0;
  let signedVolume = 0;
  let degenerateTriangleCount = 0;

  for (let offset = 0; offset < positions.length; offset += 9) {
    assertFiniteTriangle(positions, offset);
    includeTriangleInBounds(bounds, positions, offset);

    const metrics = measureTriangle(positions, offset);
    surfaceArea += metrics.area;
    signedVolume += metrics.signedVolume;

    if (metrics.area <= config.degenerateAreaEpsilon) {
      degenerateTriangleCount += 1;
    }
  }

  const dimensions = {
    x: bounds.maxX - bounds.minX,
    y: bounds.maxY - bounds.minY,
    z: bounds.maxZ - bounds.minZ
  };
  const center = {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
    z: (bounds.minZ + bounds.maxZ) / 2
  };
  const diagonal = Math.hypot(dimensions.x, dimensions.y, dimensions.z);
  const tolerance = Math.max(
    diagonal * config.topologyRelativeTolerance,
    config.topologyMinimumTolerance
  );
  const warnings = [];
  let topology;

  if (triangleCount <= config.topologyTriangleLimit) {
    topology = analyzeTopology(positions, tolerance, degenerateTriangleCount);
    appendTopologyWarnings(warnings, topology);
  } else {
    topology = {
      performed: false,
      tolerance,
      degenerateTriangleCount,
      openEdgeCount: null,
      nonManifoldEdgeCount: null,
      connectedComponentCount: null,
      watertight: null
    };
    warnings.push(ANALYSIS_WARNING_CODES.TOPOLOGY_SKIPPED_COMPLEXITY);
  }

  const volumeReliable = topology.performed && topology.watertight === true;

  if (!volumeReliable) {
    warnings.push(ANALYSIS_WARNING_CODES.VOLUME_UNRELIABLE);
  }

  return {
    rawMetrics: {
      boundingBox: {
        min: { x: bounds.minX, y: bounds.minY, z: bounds.minZ },
        max: { x: bounds.maxX, y: bounds.maxY, z: bounds.maxZ }
      },
      dimensions,
      center,
      surfaceArea,
      volume: Math.abs(signedVolume)
    },
    topology,
    volumeRaw: Math.abs(signedVolume),
    volumeReliable,
    warnings
  };
}

export function shouldPerformTopology(triangleCount, config = ANALYSIS_CONFIG) {
  return Number.isSafeInteger(triangleCount)
    && triangleCount >= 0
    && triangleCount <= config.topologyTriangleLimit;
}

function analyzeTopology(positions, tolerance, degenerateTriangleCount) {
  const vertexIds = new Map();
  const edges = new Map();
  const parents = [];
  const usedVertices = new Set();

  for (let offset = 0; offset < positions.length; offset += 9) {
    const triangle = [
      getWeldedVertexId(positions, offset, tolerance, vertexIds, parents),
      getWeldedVertexId(positions, offset + 3, tolerance, vertexIds, parents),
      getWeldedVertexId(positions, offset + 6, tolerance, vertexIds, parents)
    ];

    triangle.forEach((id) => usedVertices.add(id));
    union(parents, triangle[0], triangle[1]);
    union(parents, triangle[1], triangle[2]);
    countEdge(edges, triangle[0], triangle[1]);
    countEdge(edges, triangle[1], triangle[2]);
    countEdge(edges, triangle[2], triangle[0]);
  }

  let openEdgeCount = 0;
  let nonManifoldEdgeCount = 0;

  for (const incidence of edges.values()) {
    if (incidence === 1) {
      openEdgeCount += 1;
    } else if (incidence > 2) {
      nonManifoldEdgeCount += 1;
    }
  }

  const componentRoots = new Set(
    [...usedVertices].map((vertexId) => find(parents, vertexId))
  );

  return {
    performed: true,
    tolerance,
    degenerateTriangleCount,
    openEdgeCount,
    nonManifoldEdgeCount,
    connectedComponentCount: componentRoots.size,
    watertight: openEdgeCount === 0 && nonManifoldEdgeCount === 0
  };
}

function measureTriangle(positions, offset) {
  const ax = positions[offset];
  const ay = positions[offset + 1];
  const az = positions[offset + 2];
  const bx = positions[offset + 3];
  const by = positions[offset + 4];
  const bz = positions[offset + 5];
  const cx = positions[offset + 6];
  const cy = positions[offset + 7];
  const cz = positions[offset + 8];

  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const acx = cx - ax;
  const acy = cy - ay;
  const acz = cz - az;
  const crossX = aby * acz - abz * acy;
  const crossY = abz * acx - abx * acz;
  const crossZ = abx * acy - aby * acx;

  return {
    area: Math.hypot(crossX, crossY, crossZ) / 2,
    signedVolume: (
      ax * (by * cz - bz * cy)
      + ay * (bz * cx - bx * cz)
      + az * (bx * cy - by * cx)
    ) / 6
  };
}

function getWeldedVertexId(positions, offset, tolerance, vertexIds, parents) {
  const key = [
    Math.round(positions[offset] / tolerance),
    Math.round(positions[offset + 1] / tolerance),
    Math.round(positions[offset + 2] / tolerance)
  ].join(":");

  if (vertexIds.has(key)) {
    return vertexIds.get(key);
  }

  const id = vertexIds.size;
  vertexIds.set(key, id);
  parents[id] = id;
  return id;
}

function countEdge(edges, first, second) {
  const low = Math.min(first, second);
  const high = Math.max(first, second);
  const key = `${low}:${high}`;
  edges.set(key, (edges.get(key) ?? 0) + 1);
}

function find(parents, value) {
  let root = value;

  while (parents[root] !== root) {
    root = parents[root];
  }

  while (parents[value] !== value) {
    const next = parents[value];
    parents[value] = root;
    value = next;
  }

  return root;
}

function union(parents, first, second) {
  const firstRoot = find(parents, first);
  const secondRoot = find(parents, second);

  if (firstRoot !== secondRoot) {
    parents[secondRoot] = firstRoot;
  }
}

function appendTopologyWarnings(warnings, topology) {
  if (topology.degenerateTriangleCount > 0) {
    warnings.push(ANALYSIS_WARNING_CODES.DEGENERATE_TRIANGLES);
  }

  if (topology.openEdgeCount > 0) {
    warnings.push(ANALYSIS_WARNING_CODES.OPEN_EDGES);
  }

  if (topology.nonManifoldEdgeCount > 0) {
    warnings.push(ANALYSIS_WARNING_CODES.NON_MANIFOLD_EDGES);
  }

  if (topology.connectedComponentCount > 1) {
    warnings.push(ANALYSIS_WARNING_CODES.MULTIPLE_COMPONENTS);
  }
}

function assertFiniteTriangle(positions, offset) {
  for (let index = offset; index < offset + 9; index += 1) {
    if (!Number.isFinite(positions[index])) {
      throw new AnalysisError(ANALYSIS_ERROR_CODES.INVALID_COORDINATES);
    }
  }
}

function createEmptyBounds() {
  return {
    minX: Infinity,
    minY: Infinity,
    minZ: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
    maxZ: -Infinity
  };
}

function includeTriangleInBounds(bounds, positions, offset) {
  for (let index = offset; index < offset + 9; index += 3) {
    bounds.minX = Math.min(bounds.minX, positions[index]);
    bounds.minY = Math.min(bounds.minY, positions[index + 1]);
    bounds.minZ = Math.min(bounds.minZ, positions[index + 2]);
    bounds.maxX = Math.max(bounds.maxX, positions[index]);
    bounds.maxY = Math.max(bounds.maxY, positions[index + 1]);
    bounds.maxZ = Math.max(bounds.maxZ, positions[index + 2]);
  }
}
