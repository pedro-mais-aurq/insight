export const UPLOAD_CONFIG = Object.freeze({
  bucketName: "model-uploads",
  allowedExtensions: Object.freeze(["stl", "3mf", "obj"]),
  maxFiles: 1,
  maxFileSizeBytes: 50_000_000
});
