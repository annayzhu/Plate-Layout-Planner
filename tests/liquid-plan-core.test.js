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

test("RNAiMAX protocol distinguishes forward and reverse execution with per-well volumes", () => {
  const result = {
    finalVolumeUL: 2000,
    complexVolumeUL: 200,
    cellMediumVolumeUL: 1800,
    perWell: [
      { tube: "A", component: "siRNA", volumeUL: 2 },
      { tube: "A", component: "Opti-MEM", volumeUL: 98 },
      { tube: "B", component: "RNAiMAX", volumeUL: 6 },
      { tube: "B", component: "Opti-MEM", volumeUL: 94 },
    ],
  };
  const forward = LiquidPlan.buildTransfectionProtocol({ preset: "rnai", direction: "forward", result });
  assert.deepEqual(forward, [
    "每孔 A 管加入 siRNA 2 µL ＋ Opti-MEM 98 µL。",
    "每孔 B 管加入 RNAiMAX 6 µL ＋ Opti-MEM 94 µL。",
    "混合 A、B 管，室温孵育 5 min。",
    "每孔向已贴壁细胞加入 1800 µL 培养基。",
    "每孔向已贴壁细胞加入 200 µL A+B 复合物。",
  ]);
  const reverse = LiquidPlan.buildTransfectionProtocol({ preset: "rnai", direction: "reverse", result });
  assert.match(reverse[3], /先加入 200 µL A\+B 复合物/);
  assert.match(reverse[4], /随后每孔加入 1800 µL 细胞悬液/);
  assert.doesNotMatch(reverse.join(" "), /已贴壁细胞加入 1800/);
});

test("non-RNAi protocol does not inherit the RNAiMAX five-minute incubation", () => {
  const steps = LiquidPlan.buildTransfectionProtocol({
    language: "en",
    preset: "custom-two",
    direction: "forward",
    result: { finalVolumeUL: 300, complexVolumeUL: 30, cellMediumVolumeUL: 270, perWell: [{ tube: "A", component: "Cargo", volumeUL: 2 }, { tube: "A", component: "Medium", volumeUL: 28 }] },
  });
  assert.match(steps.join(" "), /according to the reagent instructions/);
  assert.doesNotMatch(steps.join(" "), /5 min/);
});
