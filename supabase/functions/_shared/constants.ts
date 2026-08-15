export const UPLOAD_BUCKET = "model-uploads";
export const MAX_FILE_SIZE_BYTES = 50_000_000;

export const ALLOWED_EXTENSIONS = Object.freeze([
  "stl",
  "3mf",
  "obj"
] as const);

export type AllowedExtension = typeof ALLOWED_EXTENSIONS[number];
