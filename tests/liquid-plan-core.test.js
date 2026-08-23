const test = require("node:test");
const assert = require("node:assert/strict");

const LiquidPlan = require("../liquid-plan-core.js");

function transfectionGroup(name, wellIds, cargoName = name) {
  return {
    name,
    wellIds,
    role: "Transfection",
    result: {
      overagePercent: 10,
      cargos: [{ name: cargoName }],
      totals: [
        { tube: "A", tubeRole: "cargo", component: cargoName, volumeUL: 0.3, totalVolumeUL: 1.98 },
        { tube: "A", tubeRole: "cargo", component: "Opti-MEM", volumeUL: 14.7, totalVolumeUL: 97.02 },
        { tube: "B", tubeRole: "common", component: "RNAiMAX", volumeUL: 0.9, totalVolumeUL: 5.94 },
        { tube: "B", tubeRole: "common", component: "Opti-MEM", volumeUL: 14.1, totalVolumeUL: 93.06 },
      ],
    },
  };
}

test("transfection contributions group cargo tube by siRNA identity instead of plate", () => {
  const input = { preset: "rnai", finalVolume: "300", complexVolume: "30", targetValue: "10", targetUnit: "nM", reagentPerWell: "0.9", protocolSteps: "Mix\nIncubate 5 min" };
  const plateOne = LiquidPlan.buildTransfectionContributions({ input, plate: { id: "p1", name: "A549-1" }, planName: "RNAiMAX", groups: [transfectionGroup("siFBN2-1", ["A1", "A2"])] });
  const plateTwo = LiquidPlan.buildTransfectionContributions({ input, plate: { id: "p2", name: "A549-2" }, planName: "RNAiMAX", groups: [transfectionGroup("siFBN2-1", ["B1", "B2"])] });
  const otherSirna = LiquidPlan.buildTransfectionContributions({ input, plate: { id: "p3", name: "A549-3" }, planName: "RNAiMAX", groups: [transfectionGroup("siFBN2-2", ["C1", "C2"])] });

  const firstCargoOpti = plateOne.find((item) => item.tubeRole === "cargo" && item.component === "Opti-MEM");
  const secondCargoOpti = plateTwo.find((item) => item.tubeRole === "cargo" && item.component === "Opti-MEM");
  const otherCargoOpti = otherSirna.find((item) => item.tubeRole === "cargo" && item.component === "Opti-MEM");
  assert.equal(firstCargoOpti.groupKey, secondCargoOpti.groupKey);
  assert.notEqual(firstCargoOpti.groupKey, otherCargoOpti.groupKey);
  assert.equal(firstCargoOpti.cargoIdentity, "siFBN2-1");
  assert.deepEqual(firstCargoOpti.scopeWellIds, ["A1", "A2"]);
  assert.doesNotMatch(firstCargoOpti.groupKey, /p1|A549-1/);
});

test("cargo-free compatible tube shares a key across different siRNAs", () => {
  const input = { preset: "rnai", finalVolume: "300", complexVolume: "30", targetValue: "10", targetUnit: "nM", reagentPerWell: "0.9" };
  const first = LiquidPlan.buildTransfectionContributions({ input, plate: { id: "p1", name: "Plate 1" }, planName: "RNAiMAX", groups: [transfectionGroup("siFBN2-1", ["A1"])] });
  const second = LiquidPlan.buildTransfectionContributions({ input, plate: { id: "p2", name: "Plate 2" }, planName: "RNAiMAX", groups: [transfectionGroup("siFBN2-2", ["A1"])] });

  assert.equal(first.find((item) => item.tubeRole === "common").groupKey, second.find((item) => item.tubeRole === "common").groupKey);
});
