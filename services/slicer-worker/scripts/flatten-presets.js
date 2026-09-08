#!/usr/bin/env node

// Entrada CLI estável para gerar o bundle imutável usado pelo container.
// A implementação vive no domínio de profile para continuar testável sem shell.
import { prepareProfiles } from "../src/profile/prepare-profiles.js";
import { APPROVED_REAL_PROFILE_FINGERPRINT } from "../src/profile/profile-definitions.js";

prepareProfiles()
  .then(({ real, estimation }) => {
    process.stdout.write(
      `REAL_MACHINE_SHA256=${real.files.machine.sha256}\n`
      + `REAL_PROCESS_SHA256=${real.files.process.sha256}\n`
      + `REAL_FILAMENT_SHA256=${real.files.filament.sha256}\n`
      + `REAL_PROFILE_FINGERPRINT=${real.profileFingerprint}\n`
      + `ESTIMATION_PROFILE_FINGERPRINT=${estimation.profileFingerprint}\n`
    );
    if (real.profileFingerprint !== APPROVED_REAL_PROFILE_FINGERPRINT) {
      throw new Error("APPROVED_REAL_PROFILE_FINGERPRINT_CHANGED");
    }
  })
  .catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
