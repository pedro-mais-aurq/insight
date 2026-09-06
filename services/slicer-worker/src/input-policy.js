export const UNIT_SCALES = Object.freeze({
  mm: 1,
  cm: 10,
  m: 1000,
  inch: 25.4
});

const EXTENSIONS = new Set(["stl", "obj", "3mf"]);

export function parseSliceJob(value) {
  if (!value || typeof value !== "object") throw new Error("JOB_INVALID");
  const allowedKeys = new Set([
    "jobId", "uploadId", "modelUrl", "extension", "sourceUnit", "unitScale",
    "profileKey", "profileVersion", "expectedProfileFingerprint"
  ]);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) throw new Error("JOB_INVALID");
  const jobId = value.jobId;
  const uploadId = value.uploadId;
  const extension = value.extension;
  const sourceUnit = value.sourceUnit;
  const unitScale = value.unitScale;

  if (typeof jobId !== "string" || !/^[0-9a-f-]{36}$/i.test(jobId)) throw new Error("JOB_INVALID");
  if (typeof uploadId !== "string" || !/^[0-9a-f-]{36}$/i.test(uploadId)) throw new Error("JOB_INVALID");
  if (!EXTENSIONS.has(extension)) throw new Error("JOB_INVALID");
  if (!Object.hasOwn(UNIT_SCALES, sourceUnit) || UNIT_SCALES[sourceUnit] !== unitScale) {
    throw new Error("UNIT_SCALE_INVALID");
  }
  if (typeof value.profileKey !== "string" || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(value.profileKey)) {
    throw new Error("JOB_INVALID");
  }
  if (value.profileVersion !== 1) throw new Error("JOB_INVALID");
  if (!/^[0-9a-f]{64}$/.test(value.expectedProfileFingerprint ?? "")) {
    throw new Error("PROFILE_FINGERPRINT_INVALID");
  }

  return Object.freeze({
    jobId,
    uploadId,
    modelUrl: value.modelUrl,
    extension,
    sourceUnit,
    unitScale,
    profileKey: value.profileKey,
    profileVersion: value.profileVersion,
    expectedProfileFingerprint: value.expectedProfileFingerprint
  });
}
