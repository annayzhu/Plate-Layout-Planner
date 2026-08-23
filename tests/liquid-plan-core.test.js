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

test("preparation compatibility ignores plate and display state but keeps chemical requirements", () => {
  const base = {
    preset: "rnai", direction: "forward", finalVolume: "2000", complexVolume: "200",
    stockConcentration: "10", stockUnit: "µM", targetValue: "10", targetUnit: "nM", reagentPerWell: "6",
    protocolMode: "preset", platePresetAction: "keep", groupDimension: "treatment-a", groupRoleLines: "Mock=Mock",
    protocolSteps: "Chinese generated display text", minimumPipetteVolume: "1", overagePercent: "10",
  };
  const displayOnlyDifference = {
    ...base,
    platePresetAction: "recalculate",
    groupDimension: "another-internal-id",
    groupRoleLines: "",
    protocolSteps: "English generated display text",
    minimumPipetteVolume: "2",
    overagePercent: "20",
  };
  const first = LiquidPlan.buildTransfectionContributions({ input: base, plate: { id: "p1", name: "A549-1" }, planName: "Plan A", groups: [transfectionGroup("siFBN2-1", ["A1"])] });
  const second = LiquidPlan.buildTransfectionContributions({ input: displayOnlyDifference, plate: { id: "p2", name: "A549-2" }, planName: "Plan B", groups: [transfectionGroup("siFBN2-1", ["B1", "B2"])] });

  assert.equal(first.find((item) => item.tubeRole === "cargo").groupKey, second.find((item) => item.tubeRole === "cargo").groupKey);
  assert.equal(first.find((item) => item.tubeRole === "common").groupKey, second.find((item) => item.tubeRole === "common").groupKey);
});

test("preparation compatibility normalizes equivalent concentration and amount units", () => {
  const result = transfectionGroup("siFBN2-1", ["A1"]).result;
  const micromolar = LiquidPlan.preparationCompatibility({
    input: { preset: "rnai", direction: "forward", stockConcentration: "10", stockUnit: "µM", targetValue: "10", targetUnit: "nM", totalCargoMass: "1", totalCargoMassUnit: "µg", totalCargoAmount: "1", totalCargoAmountUnit: "nmol" },
    result, tube: "A", tubeRole: "cargo",
  });
  const nanomolar = LiquidPlan.preparationCompatibility({
    input: { preset: "rnai", direction: "forward", stockConcentration: "10000", stockUnit: "nM", targetValue: "0.01", targetUnit: "µM", totalCargoMass: "1000", totalCargoMassUnit: "ng", totalCargoAmount: "1000", totalCargoAmountUnit: "pmol" },
    result, tube: "A", tubeRole: "cargo",
  });
  assert.equal(micromolar.key, nanomolar.key);
});

test("preparation compatibility separates real composition and critical handling differences", () => {
  const input = { preset: "rnai", direction: "forward", finalVolume: "2000", complexVolume: "200", stockConcentration: "10", stockUnit: "µM", targetValue: "10", targetUnit: "nM", reagentPerWell: "6" };
  const baseline = LiquidPlan.buildTransfectionContributions({ input, plate: { id: "p1" }, groups: [transfectionGroup("siFBN2-1", ["A1"])] });
  const reverse = LiquidPlan.buildTransfectionContributions({ input: { ...input, direction: "reverse" }, plate: { id: "p2" }, groups: [transfectionGroup("siFBN2-1", ["A1"])] });
  const changedGroup = transfectionGroup("siFBN2-1", ["A1"]);
  changedGroup.result.totals.find((row) => row.component === "RNAiMAX").volumeUL = 1.2;
  const changedComposition = LiquidPlan.buildTransfectionContributions({ input, plate: { id: "p3" }, groups: [changedGroup] });

  assert.notEqual(baseline.find((item) => item.tubeRole === "cargo").groupKey, reverse.find((item) => item.tubeRole === "cargo").groupKey);
  assert.notEqual(baseline.find((item) => item.tubeRole === "common").groupKey, changedComposition.find((item) => item.tubeRole === "common").groupKey);
});

test("Mock keeps the recipe cargo-tube role even when its cargo amount is zero", () => {
  const input = { preset: "rnai", direction: "forward", finalVolume: "2000", complexVolume: "200", reagentPerWell: "6" };
  const mock = {
    name: "Mock", wellIds: ["A1"], role: "Mock", result: {
      overagePercent: 10, cargos: [], finalVolumeUL: 2000, complexVolumeUL: 200, cellMediumVolumeUL: 1800,
      totals: [
        { tube: "A", tubeRole: "common", cargoDependent: false, component: "Opti-MEM", volumeUL: 100, totalVolumeUL: 110 },
        { tube: "B", tubeRole: "common", cargoDependent: false, component: "RNAiMAX", volumeUL: 6, totalVolumeUL: 6.6 },
      ],
    },
  };
  const normal = transfectionGroup("siRNA-X", ["A2"]);
  const contributions = LiquidPlan.buildTransfectionContributions({ input, plate: { id: "p1", name: "Plate 1" }, planName: "RNAiMAX", groups: [mock, normal] });
  const mockA = contributions.find((item) => item.groupName === "Mock" && item.tube === "A");
  assert.equal(mockA.tubeRole, "cargo");
  assert.equal(mockA.cargoIdentity, "Mock");
  assert.equal(contributions.find((item) => item.groupName === "Mock" && item.tube === "B").tubeRole, "common");
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

function mergedTube({ key, label, role, tube, cargoIdentity = "", order = 0, components, sources }) {
  return {
    key,
    label,
    tubeRole: role,
    tube,
    cargoIdentity,
    displayOrder: order,
    compatibilityKey: "rnai-compatible",
    components,
    sources,
  };
}

test("transfection execution plan prepares every cargo mixture before the shared reagent and preserves first appearance", () => {
  const source = (groupName, wellId, order) => ({
    plateId: "p1",
    plateName: "A549-1",
    planName: "RNAiMAX + siRNA",
    groupName,
    scopeWellIds: [wellId],
    displayOrder: order,
    direction: "forward",
    preset: "rnai",
    cellMediumVolumeUL: 1800,
    complexVolumeUL: 200,
    incubationMinutes: 5,
  });
  const cargos = ["Mock", "NC-FAM", "siFBN2-1", "siFBN2-2"].map((name, index) => mergedTube({
    key: `internal:${name}`,
    label: `${name} · A`,
    role: "cargo",
    tube: "A",
    cargoIdentity: name,
    order: index,
    components: [
      ...(name === "Mock" ? [] : [{ name, perWellVolume: 2, baseVolume: 2, preparedVolume: 2.2, containerCount: 1 }]),
      { name: "Opti-MEM", perWellVolume: name === "Mock" ? 100 : 98, baseVolume: name === "Mock" ? 100 : 98, preparedVolume: name === "Mock" ? 110 : 107.8, containerCount: 1 },
    ],
    sources: [source(name, `A${index + 1}`, index)],
  }));
  const common = mergedTube({
    key: 'transfection:{"must":"never render"}',
    label: "RNAiMAX + siRNA · B",
    role: "common",
    tube: "B",
    order: 0,
    components: [
      { name: "RNAiMAX", perWellVolume: 6, baseVolume: 24, preparedVolume: 26.4, containerCount: 1 },
      { name: "Opti-MEM", perWellVolume: 94, baseVolume: 376, preparedVolume: 413.6, containerCount: 1 },
    ],
    sources: cargos.map((group, index) => source(group.cargoIdentity, `A${index + 1}`, index)),
  });

  const plan = LiquidPlan.buildTransfectionExecutionPlan({ groups: [cargos[2], common, cargos[0], cargos[3], cargos[1]], language: "zh" });
  assert.deepEqual(plan.preparations.map((item) => item.label), ["Mock · A", "NC-FAM · A", "siFBN2-1 · A", "siFBN2-2 · A", "RNAiMAX + siRNA · B"]);
  assert.deepEqual(plan.steps.filter((step) => step.phase === "prepare-cargo").map((step) => step.cargoIdentity), ["Mock", "NC-FAM", "siFBN2-1", "siFBN2-2"]);
  assert.equal(plan.steps.findIndex((step) => step.phase === "prepare-common"), 4);
  assert.deepEqual(plan.steps.filter((step) => step.phase === "combine-incubate").map((step) => step.cargoIdentity), ["Mock", "NC-FAM", "siFBN2-1", "siFBN2-2"]);
  assert.ok(plan.steps.findIndex((step) => step.phase === "add-medium") < plan.steps.findIndex((step) => step.phase === "add-complex"));
  assert.doesNotMatch(JSON.stringify(plan), /transfection:\{/);
});

test("reverse transfection execution plan adds complexes before cell suspension", () => {
  const source = {
    plateId: "p1", plateName: "Plate 1", planName: "RNAiMAX", groupName: "siRNA-X", scopeWellIds: ["B2"],
    displayOrder: 0, direction: "reverse", preset: "rnai", cellMediumVolumeUL: 1800, complexVolumeUL: 200, incubationMinutes: 5,
  };
  const cargo = mergedTube({
    key: "cargo", label: "siRNA-X · A", role: "cargo", tube: "A", cargoIdentity: "siRNA-X", components: [{ name: "siRNA-X", perWellVolume: 2, baseVolume: 2, preparedVolume: 2.2, containerCount: 1 }], sources: [source],
  });
  const common = mergedTube({
    key: "common", label: "RNAiMAX · B", role: "common", tube: "B", components: [{ name: "RNAiMAX", perWellVolume: 6, baseVolume: 6, preparedVolume: 6.6, containerCount: 1 }], sources: [source],
  });
  const plan = LiquidPlan.buildTransfectionExecutionPlan({ groups: [cargo, common], language: "en" });
  assert.ok(plan.steps.findIndex((step) => step.phase === "add-complex") < plan.steps.findIndex((step) => step.phase === "add-cells"));
  assert.equal(plan.steps.some((step) => step.phase === "add-medium"), false);
});

test("single-plate contributions use the same canonical execution order as cross-plate summaries", () => {
  const input = { preset: "rnai", direction: "forward", finalVolume: "2000", complexVolume: "200", reagentPerWell: "6" };
  const names = ["Mock", "NC-FAM", "siFBN2-1", "siFBN2-2"];
  const groups = names.map((name, index) => {
    const group = transfectionGroup(name, [`A${index + 1}`], name);
    group.result.finalVolumeUL = 2000;
    group.result.complexVolumeUL = 200;
    group.result.cellMediumVolumeUL = 1800;
    group.result.totals = group.result.totals.map((row) => {
      if (row.tube === "A" && row.component === name) return { ...row, volumeUL: 2, totalVolumeUL: 2.2 };
      if (row.tube === "A" && row.component === "Opti-MEM") return { ...row, volumeUL: 98, totalVolumeUL: 107.8 };
      if (row.tube === "B" && row.component === "RNAiMAX") return { ...row, volumeUL: 6, totalVolumeUL: 6.6 };
      if (row.tube === "B" && row.component === "Opti-MEM") return { ...row, volumeUL: 94, totalVolumeUL: 103.4 };
      return row;
    });
    if (name === "Mock") {
      group.result.cargos = [];
      group.result.totals = [
        { tube: "A", tubeRole: "cargo", cargoDependent: true, component: "Opti-MEM", volumeUL: 100, totalVolumeUL: 110 },
        { tube: "B", tubeRole: "common", component: "RNAiMAX", volumeUL: 6, totalVolumeUL: 6.6 },
        { tube: "B", tubeRole: "common", component: "Opti-MEM", volumeUL: 94, totalVolumeUL: 103.4 },
      ];
    }
    return group;
  });
  const contributions = LiquidPlan.buildTransfectionContributions({
    input,
    plate: { id: "p1", name: "A549-1" },
    planName: "RNAiMAX + siRNA",
    groups,
  });
  const plan = LiquidPlan.buildTransfectionExecutionPlanFromContributions({ contributions, language: "zh" });

  assert.deepEqual(plan.preparations.map((item) => item.label), [
    "Mock · A", "NC-FAM · A", "siFBN2-1 · A", "siFBN2-2 · A", "RNAiMAX + siRNA · B",
  ]);
  assert.deepEqual(plan.steps.slice(0, 5).map((step) => step.phase), [
    "prepare-cargo", "prepare-cargo", "prepare-cargo", "prepare-cargo", "prepare-common",
  ]);
  assert.deepEqual(plan.steps.filter((step) => step.phase === "prepare-cargo").map((step) => step.cargoIdentity), names);
  assert.ok(plan.steps.findIndex((step) => step.phase === "prepare-common") < plan.steps.findIndex((step) => step.phase === "combine-incubate"));
  assert.ok(plan.steps.findIndex((step) => step.phase === "add-medium") < plan.steps.findIndex((step) => step.phase === "add-complex"));
});
