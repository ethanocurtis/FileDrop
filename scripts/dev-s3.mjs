// Local S3-compatible mock server for development/manual testing only.
// NOT used in production — configure a real S3-compatible provider via the
// S3_* env vars instead (see README "Object storage configuration").
import S3rver from "s3rver";
import { mkdirSync } from "node:fs";

const dataDir = new URL("../.s3rver-data", import.meta.url).pathname;
mkdirSync(dataDir, { recursive: true });

const instance = new S3rver({
  address: "0.0.0.0",
  port: 9000,
  silent: false,
  directory: dataDir,
  resetOnClose: false,
  allowMismatchedSignatures: true,
  vhostBuckets: false,
  configureBuckets: [{ name: "filedrop" }],
});

instance.run().then(() => {
  console.log("Mock S3 (s3rver) listening on http://localhost:9000, bucket 'filedrop' ready.");
});
