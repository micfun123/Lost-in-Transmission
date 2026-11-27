import assert from "node:assert/strict";
import test from "node:test";
import { interferenceIntensity } from "../web/interference.js";

test("interference intensity increases with the built-in risk labels", () => {
  const intensities = ["Light", "Moderate", "Heavy", "Severe"].map(interferenceIntensity);
  assert.ok(intensities.every((intensity, index) =>
    index === 0 || intensity > intensities[index - 1]));
});

test("unknown risk labels do not add static", () => {
  assert.equal(interferenceIntensity("Unknown"), 0);
});
