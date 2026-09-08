export const REAL_PROFILE_KEY = "insight-a1m-pla-020-v1";
export const ESTIMATION_PROFILE_KEY = "insight-estimation-a1m-pla-020-v1";
export const APPROVED_REAL_PROFILE_FINGERPRINT = "29b61bb6e0d3c5f9e7cfb8a763a735236ff25ee2af88111939d240cfe9be0d46";

export const ESTIMATION_BUILD_VOLUME_MM = Object.freeze({
  x: 2_000,
  y: 2_000,
  z: 2_000
});

export const PROFILE_SELECTIONS = Object.freeze({
  machine: "Bambu Lab A1 mini 0.4 nozzle",
  process: "0.20mm Standard @BBL A1M",
  filament: "Bambu PLA Basic @BBL A1M"
});

export function withEstimationBuildVolume(machineProfile) {
  return {
    ...structuredClone(machineProfile),
    printable_area: ["0x0", "2000x0", "2000x2000", "0x2000"],
    printable_height: "2000"
  };
}
