export const DEFAULT_MAX_WEIGHT_GRAMS = 10_000;
export const DEFAULT_MAX_PRINT_TIME_SECONDS = 30 * 24 * 60 * 60;

export function parseSliceResult({
  sliceInfoXml,
  gcode,
  maxWeightGrams = DEFAULT_MAX_WEIGHT_GRAMS,
  maxPrintTimeSeconds = DEFAULT_MAX_PRINT_TIME_SECONDS
}) {
  const metadata = sliceInfoXml ? parseSliceInfo(sliceInfoXml) : null;
  const fallback = gcode ? parseGcode(gcode) : null;
  const result = metadata ?? fallback;

  if (!result) throw new Error("SLICER_OUTPUT_MISSING");
  assertSane(result, { maxWeightGrams, maxPrintTimeSeconds });
  return Object.freeze({ ...result, supportUsed: null, warnings: [] });
}

export function parseSliceInfo(xml) {
  const plates = [...xml.matchAll(/<plate\b[^>]*>([\s\S]*?)<\/plate>/gi)].map((match) => match[1]);
  const scopes = plates.length > 0 ? plates : [xml];
  let printTimeSeconds = 0;
  let weightGrams = 0;

  for (const scope of scopes) {
    const prediction = metadataValue(scope, "prediction");
    const totalWeight = metadataValue(scope, "weight");
    const filamentWeights = [...scope.matchAll(/<filament\b[^>]*\bused_g\s*=\s*["']([^"']+)["'][^>]*\/?\s*>/gi)]
      .map((match) => Number(match[1]));
    if (!isPositive(prediction)) return null;
    const plateWeight = isPositive(totalWeight)
      ? totalWeight
      : filamentWeights.every(isNonNegative) ? filamentWeights.reduce((sum, value) => sum + value, 0) : NaN;
    if (!isPositive(plateWeight)) return null;
    printTimeSeconds += prediction;
    weightGrams += plateWeight;
  }

  return { weightGrams, printTimeSeconds: Math.round(printTimeSeconds), source: "slice_info.config" };
}

export function parseGcode(gcode) {
  const totalWeight = lastNumber(gcode, /^;\s*total filament used \[g\]\s*=\s*([\d.,]+)/gim);
  const weights = [...gcode.matchAll(/^;\s*filament used \[g\]\s*=\s*([^\r\n]+)/gim)]
    .flatMap((match) => match[1].split(/[,;]/).map((value) => Number(value.trim())))
    .filter(Number.isFinite);
  const weightGrams = isPositive(totalWeight) ? totalWeight : weights.reduce((sum, value) => sum + value, 0);
  const timeText = [...gcode.matchAll(/^;\s*estimated printing time \(normal mode\)\s*=\s*([^\r\n]+)/gim)].at(-1)?.[1];
  const printTimeSeconds = parseDuration(timeText);

  if (!isPositive(weightGrams) || !isPositive(printTimeSeconds)) return null;
  return { weightGrams, printTimeSeconds, source: "gcode-comments" };
}

export function parseDuration(value) {
  if (typeof value !== "string") return NaN;
  const days = Number(value.match(/(\d+)d/i)?.[1] ?? 0);
  const hours = Number(value.match(/(\d+)h/i)?.[1] ?? 0);
  const minutes = Number(value.match(/(\d+)m/i)?.[1] ?? 0);
  const seconds = Number(value.match(/(\d+)s/i)?.[1] ?? 0);
  const total = days * 86400 + hours * 3600 + minutes * 60 + seconds;
  return total > 0 ? total : NaN;
}

function metadataValue(xml, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`<metadata\\b(?=[^>]*\\bkey\\s*=\\s*["']${escaped}["'])(?=[^>]*\\bvalue\\s*=\\s*["']([^"']+)["'])[^>]*\\/?\\s*>`, "i");
  return Number(xml.match(regex)?.[1]);
}

function lastNumber(value, regex) {
  const matches = [...value.matchAll(regex)];
  return Number(matches.at(-1)?.[1]?.replace(",", "."));
}

function assertSane(result, { maxWeightGrams, maxPrintTimeSeconds }) {
  if (
    !isPositive(result.weightGrams)
    || result.weightGrams > maxWeightGrams
    || !Number.isSafeInteger(result.printTimeSeconds)
    || result.printTimeSeconds <= 0
    || result.printTimeSeconds > maxPrintTimeSeconds
  ) {
    throw new Error("SLICER_OUTPUT_OUT_OF_RANGE");
  }
}

function isPositive(value) {
  return Number.isFinite(value) && value > 0;
}

function isNonNegative(value) {
  return Number.isFinite(value) && value >= 0;
}
