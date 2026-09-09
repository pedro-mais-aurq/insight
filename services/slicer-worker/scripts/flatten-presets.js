#!/usr/bin/env node

// Entrada CLI estável para gerar o bundle imutável usado pelo container.
// A implementação vive no domínio de profile para continuar testável sem shell.
import { prepareProfiles } from "../src/profile/prepare-profiles.js";
import { APPROVED_REAL_PROFILE_FINGERPRINT } from "../src/profile/profile-definitions.js";

prepareProfiles()
  .then(({ real, estimation }) => {
    if (real.profileFingerprint !== APPROVED_REAL_PROFILE_FINGERPRINT) {
      throw new Error("APPROVED_REAL_PROFILE_FINGERPRINT_CHANGED");
    }
    process.stdout.write(
      `REAL_PROFILE_FINGERPRINT=${real.profileFingerprint}\nESTIMATION_PROFILE_FINGERPRINT=${estimation.profileFingerprint}\n`
    );
  })
  .catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
