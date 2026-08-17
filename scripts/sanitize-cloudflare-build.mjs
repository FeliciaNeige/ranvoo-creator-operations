import { rm } from "node:fs/promises";

// vinext writes local development variables beside the Worker during builds.
// They must never be part of a production deployment artifact.
await rm(new URL("../dist/server/.dev.vars", import.meta.url), {
  force: true,
});
