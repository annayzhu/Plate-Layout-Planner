const test = require("node:test");
const assert = require("node:assert/strict");

const Workspace = require("../workspace-core.js");

test("migrates every populated legacy plate format into an independent physical plate", () => {
  const legacy = {
    version: 1,
    name: "Legacy experiment",
    plateSize: 24,
    dimensions: [
      { id: "sample", name: "样本", type: "text" },
      { id: "dose", name: "剂量", type: "number", unit: "µM" },
    ],
    plates: {
      6: {},
      12: {},
      24: { A1: { params: { sample: "S24", dose: 1 } } },
      96: { H12: { params: { sample: "S96", dose: 2 } } },
      384: {},
    },
    colorDimension: "sample",
    calculationOutputs: [{ id: "dose", plateSize: 96, sourceId: "dose" }],
    liquidPlans: [{ id: "lp96", plateSize: 96, module: "basic", scopeWellIds: ["H12"] }],
  };

  const workspace = Workspace.normalizeWorkspace(legacy);
  assert.equal(workspace.version, 2);
  assert.equal(workspace.name, "Legacy experiment");
  assert.equal(workspace.plates.length, 2);
  assert.equal(workspace.plates[0].plateSize, 24);
  assert.equal(workspace.plates[0].plates[24].A1.params.sample, "S24");
  assert.equal(workspace.plates[1].plateSize, 96);
  assert.equal(workspace.plates[1].plates[96].H12.params.sample, "S96");
  assert.equal(workspace.plates[1].liquidPlans[0].id, "lp96");
  assert.equal(workspace.plates[0].liquidPlans.length, 0);
  assert.equal(workspace.activePlateId, workspace.plates[0].id);
});

test("supports two independent plates with the same format", () => {
  let workspace = Workspace.createWorkspace({ name: "Two plates", plateSize: 96 });
  workspace = Workspace.addPlate(workspace, { name: "Plate B", plateSize: 96 });
  assert.equal(workspace.plates.length, 2);
  assert.equal(workspace.plates[0].plateSize, 96);
  assert.equal(workspace.plates[1].plateSize, 96);
  assert.notEqual(workspace.plates[0].id, workspace.plates[1].id);
});

test("full and structure-only duplication preserve the agreed boundaries", () => {
  let workspace = Workspace.createWorkspace({ name: "Copy test", plateSize: 24 });
  const source = workspace.plates[0];
  source.name = "Source";
  source.dimensions = [{ id: "sample", name: "样本", type: "text" }];
  source.plates[24].A1 = { params: { sample: "S001" } };
  source.calculationOutputs = [{ id: "result", plateSize: 24 }];
  source.calculationLog = [{ outputId: "result" }];
  source.liquidPlans = [{ id: "plan" }];

  workspace = Workspace.duplicatePlate(workspace, source.id, "full");
  const full = workspace.plates[1];
  assert.equal(full.plates[24].A1.params.sample, "S001");
  assert.deepEqual(full.dimensions.map(({ id, name, type }) => ({ id, name, type })), source.dimensions);
  assert.deepEqual(full.calculationOutputs, []);
  assert.deepEqual(full.calculationLog, []);
  assert.deepEqual(full.liquidPlans, []);

  workspace = Workspace.duplicatePlate(workspace, source.id, "structure");
  const structure = Workspace.activePlate(workspace);
  assert.deepEqual(structure.dimensions.map(({ id, name, type }) => ({ id, name, type })), source.dimensions);
  assert.deepEqual(structure.plates[24], {});
  assert.match(structure.name, /Source/);
});

test("reorders plates and refuses to remove the final plate", () => {
  let workspace = Workspace.createWorkspace({ name: "Order", plateSize: 6 });
  workspace = Workspace.addPlate(workspace, { name: "Second", plateSize: 12 });
  const secondId = workspace.plates[1].id;
  workspace = Workspace.reorderPlate(workspace, secondId, -1);
  assert.equal(workspace.plates[0].id, secondId);
  workspace = Workspace.removePlate(workspace, secondId);
  assert.equal(workspace.plates.length, 1);
  assert.throws(() => Workspace.removePlate(workspace, workspace.plates[0].id), /at least one plate/i);
});

test("merges compatible liquid requirements before applying overage once", () => {
  const result = Workspace.mergeLiquidContributions([
    { plateId: "p1", plateName: "Plate 1", groupKey: "mix-a", component: "Medium", baseVolume: 100, unit: "µL" },
    { plateId: "p2", plateName: "Plate 2", groupKey: "mix-a", component: "Medium", baseVolume: 200, unit: "µL" },
    { plateId: "p2", plateName: "Plate 2", groupKey: "mix-b", component: "Drug", baseVolume: 10, unit: "µL" },
  ], { overagePercent: 10, minPipetteVolume: 1, maxContainerVolume: 250 });

  assert.equal(result.groups.length, 2);
  assert.equal(result.groups[0].components[0].baseVolume, 300);
  assert.equal(result.groups[0].components[0].preparedVolume, 330);
  assert.equal(result.groups[0].components[0].containerCount, 2);
  assert.deepEqual(result.groups[0].plates.map((plate) => plate.plateId), ["p1", "p2"]);
  assert.equal(result.groups[1].components[0].preparedVolume, 11);
});

test("merged liquid preparations preserve physical tube identity and destinations", () => {
  const result = Workspace.mergeLiquidContributions([
    { plateId: "p1", plateName: "A549-1", planName: "RNAiMAX", groupName: "siFBN2-1", groupKey: "cargo-si1", groupLabel: "siFBN2-1 · A", tubeRole: "cargo", tube: "A", cargoIdentity: "siFBN2-1", component: "Opti-MEM", baseVolume: 40, perWellVolume: 10, unit: "µL", scopeWellIds: ["A1", "A2"] },
    { plateId: "p2", plateName: "A549-2", planName: "RNAiMAX", groupName: "siFBN2-1", groupKey: "cargo-si1", groupLabel: "siFBN2-1 · A", tubeRole: "cargo", tube: "A", cargoIdentity: "siFBN2-1", component: "Opti-MEM", baseVolume: 60, perWellVolume: 10, unit: "µL", scopeWellIds: ["B1", "B2", "B3"] },
  ], { overagePercent: 10 });

  assert.equal(result.groups[0].label, "siFBN2-1 · A");
  assert.equal(result.groups[0].tubeRole, "cargo");
  assert.equal(result.groups[0].cargoIdentity, "siFBN2-1");
  assert.equal(result.groups[0].components[0].baseVolume, 100);
  assert.equal(result.groups[0].components[0].preparedVolume, 110.00000000000001);
  assert.deepEqual(result.groups[0].sources.map((source) => [source.plateName, source.scopeWellIds]), [["A549-1", ["A1", "A2"]], ["A549-2", ["B1", "B2", "B3"]]]);
});

test("merged liquid preparations warn when the per-well transfer is below the pipette limit", () => {
  const result = Workspace.mergeLiquidContributions([
    { plateId: "p1", groupKey: "common-b", groupLabel: "RNAiMAX · B", tubeRole: "common", tube: "B", component: "RNAiMAX", baseVolume: 54, perWellVolume: 0.9, unit: "µL" },
  ], { overagePercent: 10, minPipetteVolume: 1 });

  assert.equal(result.groups[0].components[0].warning, "below-minimum-pipette-volume");
});
