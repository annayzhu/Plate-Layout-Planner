const test = require("node:test");
const assert = require("node:assert/strict");

test("acceptance registry exposes independently runnable domain journeys", async () => {
  const { JOURNEYS } = await import("../scripts/acceptance/runner.mjs");
  assert.deepEqual(Object.keys(JOURNEYS), [
    "comprehensive",
    "plate-layout",
    "liquid-plan-lifecycle",
    "issue-28-merge",
    "issue-28-split",
  ]);
  for (const name of Object.keys(JOURNEYS).filter((item) => item !== "comprehensive")) assert.equal(typeof JOURNEYS[name], "function");
});

test("issue 28 fixture is deterministic and isolates compatible versus incompatible recipes", async () => {
  const { issue28Workspace } = await import("../scripts/acceptance/fixtures.mjs");
  const compatible = issue28Workspace({ legacyDuplicateOnFirstPlate: true });
  assert.equal(compatible.plates.length, 4);
  assert.equal(compatible.plates[0].liquidPlans.length, 2);
  const cargoKeys = compatible.plates.map((plate) => plate.liquidPlans[0].contributions.find((row) => row.cargoIdentity === "NC-FAM")?.groupKey);
  assert.equal(new Set(cargoKeys).size, 1);

  const split = issue28Workspace({ changedPlate: 4, changedTreatment: "NC-FAM" });
  const splitKeys = split.plates.map((plate) => plate.liquidPlans[0].contributions.find((row) => row.cargoIdentity === "NC-FAM")?.groupKey);
  assert.equal(new Set(splitKeys).size, 2);
});
