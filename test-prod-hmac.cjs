const crypto = require("node:crypto");

const secret = process.env.WORKER_HMAC_SECRET;

const body = JSON.stringify({
  jobId: "11111111-1111-4111-8111-111111111111",
  uploadId: "22222222-2222-4222-8222-222222222222",
  modelUrl: "https://suijnyupgkbvcusjijus.supabase.co/",
  extension: "stl",
  sourceUnit: "mm",
  unitScale: 1,
  profileKey: "insight-a1m-pla-020-v1",
  profileVersion: 1,
  expectedProfileFingerprint:
    "29b61bb6e0d3c5f9e7cfb8a763a735236ff25ee2af88111939d240cfe9be0d46"
});

const timestamp = Date.now().toString();

const signature = crypto
  .createHmac("sha256", secret)
  .update(`${timestamp}.${body}`)
  .digest("hex");

fetch(
  "https://insight-slicer-worker-p5-orca-2-4-2.onrender.com/v1/slice",
  {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-insight-timestamp": timestamp,
      "x-insight-signature": signature
    },
    body
  }
).then(async r => {
  console.log("HTTP", r.status);
  console.log(await r.text());
});