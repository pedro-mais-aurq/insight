import assert from "node:assert/strict";
import test from "node:test";
import { classifyExecutionFailure } from "../src/orca/orca-adapter.js";

test("classifica volume, complexidade e profile sem expor stderr", () => {
  assert.equal(classifyExecutionFailure({ stderr: "Object is outside the build volume" }), "MODEL_OUTSIDE_BUILD_VOLUME");
  assert.equal(classifyExecutionFailure({ stderr: "Model is too complex: too many triangles" }), "MODEL_TOO_COMPLEX");
  assert.equal(classifyExecutionFailure({ stderr: "Failed to load profile" }), "SLICER_PROFILE_INVALID");
  assert.equal(classifyExecutionFailure({ stderr: "native process failed" }), "SLICER_UNAVAILABLE");
});
