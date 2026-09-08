import { mkdir, utimes, writeFile } from "node:fs/promises";
import nodePath from "node:path";
import { ESTIMATION_BUILD_VOLUME_MM } from "../profile/profile-definitions.js";
import { runProcess } from "./process.js";
import { assertBuildVolume } from "./model-normalizer.js";

const CORE_NAMESPACE = "http://schemas.microsoft.com/3dmanufacturing/core/2015/02";
const ROOT_MODEL = "3D/3dmodel.model";
const MAX_ARCHIVE_ENTRIES = 4_096;
const MAX_MODEL_PARTS = 64;
const MAX_GEOMETRY_XML_BYTES = 50_000_000;
const MAX_VERTICES = 2_000_000;
const MAX_TRIANGLES = 4_000_000;
const MAX_COMPONENT_INSTANCES = 10_000;
const MAX_COMPONENT_DEPTH = 64;
const FIXED_TIME = new Date("2026-07-07T03:33:00.000Z");

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>
`;
const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>
`;
const UNIT_DECLARATIONS = Object.freeze({
  millimeter: Object.freeze({ sourceUnit: "mm", factor: 1 }),
  centimeter: Object.freeze({ sourceUnit: "cm", factor: 10 }),
  meter: Object.freeze({ sourceUnit: "m", factor: 1_000 }),
  inch: Object.freeze({ sourceUnit: "inch", factor: 25.4 })
});

export async function canonicalize3mf({
  inputPath,
  outputPath,
  stagingDir,
  sourceUnit,
  buildVolumeMm = ESTIMATION_BUILD_VOLUME_MM
}) {
  const listed = await runProcess("unzip", ["-Z1", inputPath], { timeoutMs: 20_000 });
  if (listed.code !== 0 || listed.outputTruncated) throw new Error("THREE_MF_INVALID");

  const archiveEntries = listed.stdout.split(/\r?\n/).filter(Boolean);
  if (archiveEntries.length === 0 || archiveEntries.length > MAX_ARCHIVE_ENTRIES) {
    throw new Error("THREE_MF_INVALID");
  }
  const modelEntries = selectGeometryEntries(archiveEntries);
  if (!modelEntries.includes(ROOT_MODEL)) throw new Error("THREE_MF_GEOMETRY_MISSING");
  if (modelEntries.length > MAX_MODEL_PARTS) throw new Error("MODEL_TOO_COMPLEX");

  const models = new Map();
  let extractedBytes = 0;
  for (const entry of modelEntries) {
    let extracted;
    try {
      extracted = await runProcess("unzip", ["-p", inputPath, entry], {
        timeoutMs: 20_000,
        maxOutputBytes: MAX_GEOMETRY_XML_BYTES,
        failOnOutputLimit: true
      });
    } catch (error) {
      if (error?.message === "PROCESS_OUTPUT_LIMIT") throw new Error("MODEL_TOO_COMPLEX");
      throw new Error("THREE_MF_INVALID", { cause: error });
    }
    if (extracted.code !== 0 || !extracted.stdout || extracted.outputTruncated) {
      throw new Error("THREE_MF_INVALID");
    }
    extractedBytes += Buffer.byteLength(extracted.stdout);
    if (extractedBytes > MAX_GEOMETRY_XML_BYTES) throw new Error("MODEL_TOO_COMPLEX");
    models.set(entry, parseGeometryModel(extracted.stdout, entry));
  }

  const root = models.get(ROOT_MODEL);
  const declared = UNIT_DECLARATIONS[root.unit];
  if (!declared || declared.sourceUnit !== sourceUnit) throw new Error("THREE_MF_UNIT_MISMATCH");
  for (const model of models.values()) {
    const partUnit = UNIT_DECLARATIONS[model.unit];
    if (!partUnit || partUnit.sourceUnit !== sourceUnit) {
      throw new Error("THREE_MF_UNIT_MISMATCH");
    }
    normalizePartToMillimeters(model, partUnit.factor);
  }

  const canonical = buildCanonicalModel(models, root);
  const bounds = measureBuild(canonical);
  assertBuildVolume(bounds.dimensionsMm, buildVolumeMm);
  const translation = bounds.min.map((value) => normalizeZero(-value));
  for (const item of canonical.build) {
    item.transform = translateTransform(item.transform, translation);
  }

  await mkdir(nodePath.join(stagingDir, "3D"), { recursive: true });
  await mkdir(nodePath.join(stagingDir, "_rels"), { recursive: true });
  await writeFile(nodePath.join(stagingDir, "[Content_Types].xml"), CONTENT_TYPES, { mode: 0o600 });
  await writeFile(nodePath.join(stagingDir, "_rels/.rels"), ROOT_RELS, { mode: 0o600 });
  await writeFile(nodePath.join(stagingDir, ROOT_MODEL), serializeCanonicalModel(canonical), { mode: 0o600 });

  const outputEntries = ["[Content_Types].xml", "_rels/.rels", ROOT_MODEL];
  for (const entry of outputEntries) {
    await utimes(nodePath.join(stagingDir, entry), FIXED_TIME, FIXED_TIME);
  }
  const zipped = await runProcess("zip", ["-X", "-q", outputPath, ...outputEntries], {
    cwd: stagingDir,
    timeoutMs: 20_000
  });
  if (zipped.code !== 0) throw new Error("THREE_MF_CANONICALIZATION_FAILED");
  return Object.freeze({
    outputPath,
    dimensionsMm: Object.freeze(bounds.dimensionsMm),
    format: "3mf"
  });
}

export function selectGeometryEntries(entries) {
  const seen = new Set();
  const selected = [];
  for (const entry of entries) {
    assertSafeArchivePath(entry);
    const folded = entry.toLowerCase();
    if (seen.has(folded)) throw new Error("THREE_MF_PATH_INVALID");
    seen.add(folded);
    if (/^3D\/(?:[^/]+\/)*[^/]+\.model$/i.test(entry)) selected.push(entry);
  }
  return selected.sort((left, right) => left.localeCompare(right));
}

function parseGeometryModel(xml, sourcePath) {
  const model = { path: sourcePath, unit: "millimeter", objects: new Map(), build: [] };
  const stack = [];
  let currentObject = null;
  let rootSeen = false;
  let elementCount = 0;

  for (const token of tokenizeXml(xml)) {
    elementCount += 1;
    if (elementCount > 10_000_000) throw new Error("MODEL_TOO_COMPLEX");
    if (token.type === "end") {
      const expected = stack.pop();
      if (expected !== token.name) throw new Error("THREE_MF_INVALID");
      if (localName(token.name) === "object" && pathEquals(stack, ["model", "resources"])) {
        currentObject = null;
      }
      continue;
    }

    const local = localName(token.name);
    if (stack.length === 0) {
      if (rootSeen || local !== "model") throw new Error("THREE_MF_INVALID");
      rootSeen = true;
      const namespace = attribute(token.attributes, "xmlns");
      if (namespace !== CORE_NAMESPACE) throw new Error("THREE_MF_INVALID");
      model.unit = (attribute(token.attributes, "unit") ?? "millimeter").toLowerCase();
    } else if (local === "object" && pathEquals(stack, ["model", "resources"])) {
      const id = positiveInteger(attribute(token.attributes, "id"));
      if (model.objects.has(id)) throw new Error("THREE_MF_INVALID");
      currentObject = { id, mesh: null, components: null };
      model.objects.set(id, currentObject);
    } else if (local === "mesh" && currentObject && pathEquals(stack, ["model", "resources", "object"])) {
      if (currentObject.mesh || currentObject.components) throw new Error("THREE_MF_INVALID");
      currentObject.mesh = { vertices: [], triangles: [] };
    } else if (
      local === "vertex"
      && currentObject?.mesh
      && pathEquals(stack, ["model", "resources", "object", "mesh", "vertices"])
    ) {
      currentObject.mesh.vertices.push(
        finiteNumber(attribute(token.attributes, "x")),
        finiteNumber(attribute(token.attributes, "y")),
        finiteNumber(attribute(token.attributes, "z"))
      );
      if (currentObject.mesh.vertices.length / 3 > MAX_VERTICES) throw new Error("MODEL_TOO_COMPLEX");
    } else if (
      local === "triangle"
      && currentObject?.mesh
      && pathEquals(stack, ["model", "resources", "object", "mesh", "triangles"])
    ) {
      currentObject.mesh.triangles.push(
        nonNegativeInteger(attribute(token.attributes, "v1")),
        nonNegativeInteger(attribute(token.attributes, "v2")),
        nonNegativeInteger(attribute(token.attributes, "v3"))
      );
      if (currentObject.mesh.triangles.length / 3 > MAX_TRIANGLES) throw new Error("MODEL_TOO_COMPLEX");
    } else if (
      local === "components"
      && currentObject
      && pathEquals(stack, ["model", "resources", "object"])
    ) {
      if (currentObject.mesh || currentObject.components) throw new Error("THREE_MF_INVALID");
      currentObject.components = [];
    } else if (
      local === "component"
      && currentObject?.components
      && pathEquals(stack, ["model", "resources", "object", "components"])
    ) {
      currentObject.components.push({
        objectId: positiveInteger(attribute(token.attributes, "objectid")),
        path: attributeByLocalName(token.attributes, "path"),
        transform: parseTransform(attribute(token.attributes, "transform"))
      });
    } else if (local === "item" && pathEquals(stack, ["model", "build"])) {
      model.build.push({
        objectId: positiveInteger(attribute(token.attributes, "objectid")),
        path: attributeByLocalName(token.attributes, "path"),
        transform: parseTransform(attribute(token.attributes, "transform")),
        printable: parseOptionalBoolean(attribute(token.attributes, "printable"))
      });
    }

    if (!token.selfClosing) stack.push(token.name);
  }

  if (!rootSeen || stack.length !== 0 || model.objects.size === 0) {
    throw new Error("THREE_MF_GEOMETRY_MISSING");
  }
  for (const object of model.objects.values()) validateObject(object);
  return model;
}

function validateObject(object) {
  if (object.mesh) {
    const vertexCount = object.mesh.vertices.length / 3;
    if (vertexCount < 3 || object.mesh.triangles.length < 3) {
      throw new Error("THREE_MF_GEOMETRY_MISSING");
    }
    for (const index of object.mesh.triangles) {
      if (index >= vertexCount) throw new Error("THREE_MF_INVALID");
    }
    return;
  }
  if (!object.components || object.components.length === 0) {
    throw new Error("THREE_MF_GEOMETRY_MISSING");
  }
}

function normalizePartToMillimeters(model, factor) {
  for (const object of model.objects.values()) {
    if (object.mesh) {
      for (let index = 0; index < object.mesh.vertices.length; index += 1) {
        object.mesh.vertices[index] = normalizeZero(object.mesh.vertices[index] * factor);
      }
    }
    for (const component of object.components ?? []) {
      component.transform = scaleTransformTranslation(component.transform, factor);
    }
  }
  for (const item of model.build) item.transform = scaleTransformTranslation(item.transform, factor);
  model.unit = "millimeter";
}

function buildCanonicalModel(models, root) {
  if (root.build.length === 0) throw new Error("THREE_MF_GEOMETRY_MISSING");
  const reachable = new Set();
  const active = new Set();

  const resolveReference = (ownerPath, reference) => {
    const targetPath = resolveModelPath(ownerPath, reference.path);
    const targetModel = models.get(targetPath);
    const target = targetModel?.objects.get(reference.objectId);
    if (!target) throw new Error("THREE_MF_GEOMETRY_MISSING");
    return { targetPath, target, key: objectKey(targetPath, reference.objectId) };
  };

  const visit = (modelPath, object) => {
    const key = objectKey(modelPath, object.id);
    if (active.has(key)) throw new Error("THREE_MF_INVALID");
    if (reachable.has(key)) return;
    active.add(key);
    reachable.add(key);
    for (const component of object.components ?? []) {
      const resolved = resolveReference(modelPath, component);
      component.targetKey = resolved.key;
      visit(resolved.targetPath, resolved.target);
    }
    active.delete(key);
  };

  for (const item of root.build) {
    const resolved = resolveReference(root.path, item);
    item.targetKey = resolved.key;
    visit(resolved.targetPath, resolved.target);
  }

  const orderedKeys = [...reachable].sort(compareObjectKeys);
  const idByKey = new Map(orderedKeys.map((key, index) => [key, index + 1]));
  const objects = orderedKeys.map((key) => {
    const { modelPath, objectId } = splitObjectKey(key);
    const source = models.get(modelPath).objects.get(objectId);
    return {
      id: idByKey.get(key),
      mesh: source.mesh,
      components: source.components?.map((component) => ({
        objectId: idByKey.get(component.targetKey),
        transform: component.transform
      })) ?? null
    };
  });
  const build = root.build.map((item) => ({
    objectId: idByKey.get(item.targetKey),
    transform: item.transform,
    printable: item.printable
  }));
  return { objects, build };
}

function measureBuild(canonical) {
  const objects = new Map(canonical.objects.map((object) => [object.id, object]));
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let instanceCount = 0;

  const visit = (objectId, matrix, depth) => {
    if (depth > MAX_COMPONENT_DEPTH) throw new Error("MODEL_TOO_COMPLEX");
    const object = objects.get(objectId);
    if (!object) throw new Error("THREE_MF_GEOMETRY_MISSING");
    instanceCount += 1;
    if (instanceCount > MAX_COMPONENT_INSTANCES) throw new Error("MODEL_TOO_COMPLEX");
    if (object.mesh) {
      const vertices = object.mesh.vertices;
      for (let index = 0; index < vertices.length; index += 3) {
        updateBounds(transformPoint(matrix, vertices[index], vertices[index + 1], vertices[index + 2]), min, max);
      }
      return;
    }
    for (const component of object.components ?? []) {
      visit(component.objectId, multiplyMatrices(matrix, matrixFromTransform(component.transform)), depth + 1);
    }
  };

  for (const item of canonical.build) {
    if (item.printable === false) continue;
    visit(item.objectId, matrixFromTransform(item.transform), 0);
  }
  if (min.some((value) => !Number.isFinite(value)) || max.some((value) => !Number.isFinite(value))) {
    throw new Error("THREE_MF_GEOMETRY_MISSING");
  }
  return {
    min,
    max,
    dimensionsMm: {
      x: max[0] - min[0],
      y: max[1] - min[1],
      z: max[2] - min[2]
    }
  };
}

function serializeCanonicalModel(canonical) {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<model unit="millimeter" xml:lang="en-US" xmlns="${CORE_NAMESPACE}">`,
    "  <resources>"
  ];
  for (const object of canonical.objects) {
    lines.push(`    <object id="${object.id}" type="model">`);
    if (object.mesh) {
      lines.push("      <mesh>", "        <vertices>");
      for (let index = 0; index < object.mesh.vertices.length; index += 3) {
        lines.push(`          <vertex x="${formatNumber(object.mesh.vertices[index])}" y="${formatNumber(object.mesh.vertices[index + 1])}" z="${formatNumber(object.mesh.vertices[index + 2])}"/>`);
      }
      lines.push("        </vertices>", "        <triangles>");
      for (let index = 0; index < object.mesh.triangles.length; index += 3) {
        lines.push(`          <triangle v1="${object.mesh.triangles[index]}" v2="${object.mesh.triangles[index + 1]}" v3="${object.mesh.triangles[index + 2]}"/>`);
      }
      lines.push("        </triangles>", "      </mesh>");
    } else {
      lines.push("      <components>");
      for (const component of object.components) {
        lines.push(`        <component objectid="${component.objectId}"${serializeTransform(component.transform)}/>`);
      }
      lines.push("      </components>");
    }
    lines.push("    </object>");
  }
  lines.push("  </resources>", "  <build>");
  for (const item of canonical.build) {
    const printable = item.printable === null ? "" : ` printable="${item.printable}"`;
    lines.push(`    <item objectid="${item.objectId}"${serializeTransform(item.transform)}${printable}/>`);
  }
  lines.push("  </build>", "</model>", "");
  return lines.join("\n");
}

function* tokenizeXml(xml) {
  let cursor = 0;
  while (cursor < xml.length) {
    const open = xml.indexOf("<", cursor);
    if (open === -1) return;
    if (xml.startsWith("<!--", open)) {
      const end = xml.indexOf("-->", open + 4);
      if (end === -1) throw new Error("THREE_MF_INVALID");
      cursor = end + 3;
      continue;
    }
    if (xml.startsWith("<?", open)) {
      const end = xml.indexOf("?>", open + 2);
      if (end === -1) throw new Error("THREE_MF_INVALID");
      cursor = end + 2;
      continue;
    }
    if (xml.startsWith("<![CDATA[", open)) {
      const end = xml.indexOf("]]>", open + 9);
      if (end === -1) throw new Error("THREE_MF_INVALID");
      cursor = end + 3;
      continue;
    }
    if (xml.startsWith("<!", open)) throw new Error("THREE_MF_INVALID");
    const close = findTagClose(xml, open + 1);
    let body = xml.slice(open + 1, close).trim();
    if (!body) throw new Error("THREE_MF_INVALID");
    if (body.startsWith("/")) {
      const name = body.slice(1).trim();
      assertXmlName(name);
      yield { type: "end", name };
    } else {
      const selfClosing = body.endsWith("/");
      if (selfClosing) body = body.slice(0, -1).trimEnd();
      const { name, attributes } = parseStartTag(body);
      yield { type: "start", name, attributes, selfClosing };
    }
    cursor = close + 1;
  }
}

function findTagClose(xml, start) {
  let quote = null;
  for (let index = start; index < xml.length; index += 1) {
    const character = xml[index];
    if (quote) {
      if (character === quote) quote = null;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ">") {
      return index;
    }
  }
  throw new Error("THREE_MF_INVALID");
}

function parseStartTag(body) {
  let cursor = 0;
  while (cursor < body.length && !/\s/u.test(body[cursor])) cursor += 1;
  const name = body.slice(0, cursor);
  assertXmlName(name);
  const attributes = new Map();

  while (cursor < body.length) {
    while (/\s/u.test(body[cursor] ?? "")) cursor += 1;
    if (cursor >= body.length) break;
    const nameStart = cursor;
    while (cursor < body.length && !/[\s=]/u.test(body[cursor])) cursor += 1;
    const attributeName = body.slice(nameStart, cursor);
    assertXmlName(attributeName);
    while (/\s/u.test(body[cursor] ?? "")) cursor += 1;
    if (body[cursor] !== "=") throw new Error("THREE_MF_INVALID");
    cursor += 1;
    while (/\s/u.test(body[cursor] ?? "")) cursor += 1;
    const quote = body[cursor];
    if (quote !== '"' && quote !== "'") throw new Error("THREE_MF_INVALID");
    cursor += 1;
    const valueStart = cursor;
    while (cursor < body.length && body[cursor] !== quote) cursor += 1;
    if (cursor >= body.length) throw new Error("THREE_MF_INVALID");
    if (attributes.has(attributeName)) throw new Error("THREE_MF_INVALID");
    attributes.set(attributeName, decodeXml(body.slice(valueStart, cursor)));
    cursor += 1;
  }
  return { name, attributes };
}

function assertXmlName(value) {
  if (!/^[A-Za-z_][A-Za-z0-9_.:-]*$/u.test(value)) throw new Error("THREE_MF_INVALID");
}

function decodeXml(value) {
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(value)) {
    throw new Error("THREE_MF_INVALID");
  }
  if (/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-f]+;)/iu.test(value)) {
    throw new Error("THREE_MF_INVALID");
  }
  return value.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/giu, (entity) => {
    if (entity === "&amp;") return "&";
    if (entity === "&lt;") return "<";
    if (entity === "&gt;") return ">";
    if (entity === "&quot;") return '"';
    if (entity === "&apos;") return "'";
    const codePoint = entity.startsWith("&#x")
      ? Number.parseInt(entity.slice(3, -1), 16)
      : Number.parseInt(entity.slice(2, -1), 10);
    if (
      !Number.isInteger(codePoint)
      || codePoint < 0
      || codePoint > 0x10ffff
      || (codePoint < 0x20 && ![0x9, 0xa, 0xd].includes(codePoint))
      || (codePoint >= 0xd800 && codePoint <= 0xdfff)
    ) {
      throw new Error("THREE_MF_INVALID");
    }
    return String.fromCodePoint(codePoint);
  });
}

function attribute(attributes, name) {
  return attributes.get(name);
}

function attributeByLocalName(attributes, wanted) {
  const matches = [...attributes.entries()].filter(([name]) => localName(name) === wanted);
  if (matches.length > 1) throw new Error("THREE_MF_INVALID");
  return matches[0]?.[1];
}

function localName(name) {
  return name.split(":").at(-1).toLowerCase();
}

function pathEquals(stack, expected) {
  return stack.length === expected.length
    && stack.every((name, index) => localName(name) === expected[index]);
}

function resolveModelPath(ownerPath, referencePath) {
  if (!referencePath) return ownerPath;
  if (referencePath.includes("\\") || /[?#\0]/u.test(referencePath)) {
    throw new Error("THREE_MF_PATH_INVALID");
  }
  let decoded;
  try {
    decoded = decodeURIComponent(referencePath);
  } catch (error) {
    throw new Error("THREE_MF_PATH_INVALID", { cause: error });
  }
  const relative = decoded.startsWith("/")
    ? decoded.slice(1)
    : nodePath.posix.join(nodePath.posix.dirname(ownerPath), decoded);
  assertSafeArchivePath(relative);
  const normalized = nodePath.posix.normalize(relative);
  assertSafeArchivePath(normalized);
  return normalized;
}

function assertSafeArchivePath(entry) {
  if (
    typeof entry !== "string"
    || entry.length === 0
    || entry.includes("\\")
    || entry.includes("\0")
    || entry.startsWith("/")
    || /^[A-Za-z]:/u.test(entry)
    || entry.split("/").includes("..")
    || entry.includes("//")
  ) {
    throw new Error("THREE_MF_PATH_INVALID");
  }
}

function parseTransform(value) {
  if (value === undefined) return null;
  const values = value.trim().split(/\s+/u).map(Number);
  if (values.length !== 12 || values.some((number) => !Number.isFinite(number) || Math.abs(number) > 1e12)) {
    throw new Error("THREE_MF_INVALID");
  }
  return values.map(normalizeZero);
}

function parseOptionalBoolean(value) {
  if (value === undefined) return null;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  throw new Error("THREE_MF_INVALID");
}

function scaleTransformTranslation(transform, factor) {
  if (!transform) return null;
  const scaled = [...transform];
  for (const index of [9, 10, 11]) scaled[index] = normalizeZero(scaled[index] * factor);
  return scaled;
}

function translateTransform(transform, translation) {
  const translated = transform ? [...transform] : identityTransform();
  for (let axis = 0; axis < 3; axis += 1) {
    translated[9 + axis] = normalizeZero(translated[9 + axis] + translation[axis]);
  }
  return isIdentityTransform(translated) ? null : translated;
}

function matrixFromTransform(transform) {
  const value = transform ?? identityTransform();
  return [
    value[0], value[3], value[6], value[9],
    value[1], value[4], value[7], value[10],
    value[2], value[5], value[8], value[11],
    0, 0, 0, 1
  ];
}

function multiplyMatrices(left, right) {
  const output = new Array(16).fill(0);
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      for (let inner = 0; inner < 4; inner += 1) {
        output[row * 4 + column] += left[row * 4 + inner] * right[inner * 4 + column];
      }
    }
  }
  return output;
}

function transformPoint(matrix, x, y, z) {
  return [
    matrix[0] * x + matrix[1] * y + matrix[2] * z + matrix[3],
    matrix[4] * x + matrix[5] * y + matrix[6] * z + matrix[7],
    matrix[8] * x + matrix[9] * y + matrix[10] * z + matrix[11]
  ];
}

function updateBounds(point, min, max) {
  if (point.some((value) => !Number.isFinite(value))) throw new Error("THREE_MF_INVALID");
  for (let axis = 0; axis < 3; axis += 1) {
    min[axis] = Math.min(min[axis], point[axis]);
    max[axis] = Math.max(max[axis], point[axis]);
  }
}

function serializeTransform(transform) {
  return transform ? ` transform="${transform.map(formatNumber).join(" ")}"` : "";
}

function identityTransform() {
  return [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
}

function isIdentityTransform(value) {
  const identity = identityTransform();
  return value.every((number, index) => number === identity[index]);
}

function finiteNumber(value) {
  const parsed = Number(value);
  if (value === undefined || !Number.isFinite(parsed) || Math.abs(parsed) > 1e12) {
    throw new Error("THREE_MF_INVALID");
  }
  return normalizeZero(parsed);
}

function positiveInteger(value) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error("THREE_MF_INVALID");
  return parsed;
}

function nonNegativeInteger(value) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error("THREE_MF_INVALID");
  return parsed;
}

function objectKey(modelPath, objectId) {
  return `${modelPath}\0${objectId}`;
}

function splitObjectKey(key) {
  const separator = key.lastIndexOf("\0");
  return { modelPath: key.slice(0, separator), objectId: Number(key.slice(separator + 1)) };
}

function compareObjectKeys(left, right) {
  const first = splitObjectKey(left);
  const second = splitObjectKey(right);
  return first.modelPath.localeCompare(second.modelPath) || first.objectId - second.objectId;
}

function normalizeZero(value) {
  return Object.is(value, -0) || Math.abs(value) < 1e-12 ? 0 : value;
}

function formatNumber(value) {
  return normalizeZero(value).toString();
}
