const crypto = require("node:crypto");

const secret =
  "01234567890123456789012345678901";

const body = JSON.stringify({
  jobId: "11111111-1111-4111-8111-111111111111",
  uploadId: "22222222-2222-4222-8222-222222222222",

  modelUrl:
    "https://raw.githubusercontent.com/pedro-mais-aurq/insight/main/services/slicer-worker/test/fixtures/cube.stl",

  extension: "stl",
  sourceUnit: "mm",
  unitScale: 1,

  profileKey:
    "insight-a1m-pla-020-v1",

  profileVersion: 1,

  expectedProfileFingerprint:
    "29b61bb6e0d3c5f9e7cfb8a763a735236ff25ee2af88111939d240cfe9be0d46"
});

const timestamp =
  Date.now().toString();

const signature =
  crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${body}`, "utf8")
    .digest("hex");

(async () => {
  const response =
    await fetch(
      "http://localhost:8080/v1/slice",
      {
        method: "POST",

        headers: {
          "content-type":
            "application/json",

          "x-insight-timestamp":
            timestamp,

          "x-insight-signature":
            signature
        },

        body
      }
    );

  const responseBody =
    await response.text();

  console.log(
    "HTTP",
    response.status
  );

  console.log(
    responseBody
  );

  const responseTimestamp =
    response.headers.get(
      "x-insight-timestamp"
    );

  const responseSignature =
    response.headers.get(
      "x-insight-signature"
    );

  const expectedResponseSignature =
    crypto
      .createHmac("sha256", secret)
      .update(
        `${responseTimestamp}.${responseBody}`,
        "utf8"
      )
      .digest("hex");

  const signatureOk =
    responseSignature ===
    expectedResponseSignature;

  console.log(
    "RESPONSE_SIGNATURE_OK",
    signatureOk
  );

  if (
    response.status !== 200 ||
    !signatureOk
  ) {
    process.exit(1);
  }
})();