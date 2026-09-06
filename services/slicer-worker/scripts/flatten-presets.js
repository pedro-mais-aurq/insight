#!/usr/bin/env node

// Entrada CLI estável para gerar o bundle imutável usado pelo container.
// A implementação vive no domínio de profile para continuar testável sem shell.
import { prepareProfiles } from "../src/profile/prepare-profiles.js";

prepareProfiles()
  .then((manifest) => process.stdout.write(`${manifest.profileFingerprint}\n`))
  .catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
