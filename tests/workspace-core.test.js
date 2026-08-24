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

test("compares plate names after trimming, unicode normalization, and case folding", () => {
  let workspace = Workspace.createWorkspace({ name: "Naming", plateName: "Plate A", plateSize: 24 });
  workspace = Workspace.addPlate(workspace, { name: "Plate B", plateSize: 24 });

  assert.equal(Workspace.normalizePlateName("  PLATE A  "), "plate a");
  assert.equal(Workspace.plateNameConflict(workspace, " plate a ", workspace.plates[1].id)?.id, workspace.plates[0].id);
  assert.equal(Workspace.plateNameConflict(workspace, "Plate B", workspace.plates[1].id), null);
  assert.equal(Workspace.plateNameConflict(workspace, "Plate C", workspace.plates[1].id), null);
});

test("generates a unique bounded copy name even when the source name is 80 characters", () => {
  const longName = "A".repeat(80);
  let workspace = Workspace.createWorkspace({ plateName: longName, plateSize: 24 });
  workspace = Workspace.duplicatePlate(workspace, workspace.plates[0].id, "structure");
  const copy = Workspace.activePlate(workspace);
  assert.equal(copy.name.length <= 80, true);
  assert.notEqual(Workspace.normalizePlateName(copy.name), Workspace.normalizePlateName(longName));
  assert.equal(Workspace.plateNameConflict(workspace, copy.name, copy.id), null);
});

test("normalization preserves well maps from every format of a physical plate", () => {
  const workspace = Workspace.createWorkspace({ plateName: "Multi-format", plateSize: 96 });
  workspace.plates[0].plates[96].A1 = { params: { sample: "visible" } };
  workspace.plates[0].plates[24].B2 = { params: { sample: "stored" } };

  const restored = Workspace.normalizeWorkspace(JSON.parse(JSON.stringify(workspace)));
  assert.equal(restored.plates[0].plates[96].A1.params.sample, "visible");
  assert.equal(restored.plates[0].plates[24].B2.params.sample, "stored");
});

test("clears a physical plate layout while preserving structure and making its plan stale", () => {
  const plate = Workspace.createPlate({
    id: "p1",
    name: "A549-1",
    plateSize: 96,
    dimensions: [
      { id: "sample", name: "样本", type: "text" },
      { id: "calculated", name: "计算结果", type: "number", unit: "µL" },
    ],
    wells: { A1: { params: { sample: "Mock", calculated: 4 } } },
    calculationLog: [{ outputId: "calculated" }],
    calculationOutputs: [{ id: "calculated", sourceId: "sample" }],
    liquidPlans: [{ id: "plan-1", status: "saved", stale: false }],
  });
  plate.plates[24].B2 = { params: { sample: "hidden-layout" } };

  const cleared = Workspace.clearPlateLayout(plate);

  assert.equal(cleared.name, "A549-1");
  assert.equal(cleared.plateSize, 96);
  assert.deepEqual(cleared.dimensions.map((dimension) => dimension.id), ["sample"]);
  assert.deepEqual(cleared.plates, { 6: {}, 12: {}, 24: {}, 96: {}, 384: {} });
  assert.deepEqual(cleared.calculationLog, []);
  assert.deepEqual(cleared.calculationOutputs, []);
  assert.equal(Workspace.currentLiquidPlan(cleared).stale, true);
  assert.equal(Workspace.currentLiquidPlan(cleared).status, "stale");
  assert.equal(plate.plates[96].A1.params.sample, "Mock");
});

test("normalizes legacy duplicate liquid plans to one current plan and an inert archive", () => {
  const workspace = Workspace.normalizeWorkspace({
    version: 2,
    name: "Duplicate plan fixture",
    activePlateId: "p1",
    latestLiquidSummary: { plateNames: ["stale cached summary"] },
    plates: [{
      id: "p1",
      name: "A549-1",
      plateSize: 6,
      dimensions: [],
      plates: { 6: {} },
      liquidPlans: [
        { id: "old", name: "Old plan", updatedAt: "2026-08-23T10:00:00.000Z", stale: false },
        { id: "latest", name: "Latest plan", updatedAt: "2026-08-23T11:00:00.000Z", stale: false },
      ],
    }],
  });

  const plate = workspace.plates[0];
  assert.equal(Workspace.currentLiquidPlan(plate).id, "latest");
  assert.equal(plate.liquidPlans.length, 1);
  assert.deepEqual(plate.archivedLiquidPlans.map((plan) => plan.id), ["old"]);
  assert.deepEqual(workspace.migrationNotices, [{ plateId: "p1", plateName: "A549-1", keptPlanName: "Latest plan", archivedCount: 1 }]);
  assert.equal(workspace.latestLiquidSummary, null);
});

test("publishing a liquid plan atomically replaces the plate plan while preserving identity", () => {
  const plate = Workspace.createPlate({
    id: "p1",
    name: "A549-1",
    plateSize: 6,
    liquidPlans: [{ id: "current", name: "Old plan", createdAt: "2026-08-23T10:00:00.000Z", updatedAt: "2026-08-23T10:00:00.000Z" }],
  });
  const published = Workspace.publishLiquidPlan(plate, { id: "ignored-new-id", name: "Updated plan", updatedAt: "2026-08-23T11:00:00.000Z" });

  assert.equal(published.liquidPlans.length, 1);
  assert.equal(Workspace.currentLiquidPlan(published).id, "current");
  assert.equal(Workspace.currentLiquidPlan(published).name, "Updated plan");
  assert.equal(Workspace.currentLiquidPlan(published).createdAt, "2026-08-23T10:00:00.000Z");
  assert.equal(plate.liquidPlans[0].name, "Old plan");
});

test("marking and clearing the current liquid plan cannot revive archived plans", () => {
  const plate = Workspace.createPlate({ id: "p1", liquidPlans: [{ id: "current", stale: false }], archivedLiquidPlans: [{ id: "archived" }] });
  const stale = Workspace.markLiquidPlanStale(plate);
  assert.equal(Workspace.currentLiquidPlan(stale).stale, true);
  assert.equal(Workspace.currentLiquidPlan(stale).status, "stale");
  assert.equal(Workspace.usableLiquidPlan(stale), null);
  const cleared = Workspace.clearLiquidPlan(stale);
  assert.equal(Workspace.currentLiquidPlan(cleared), null);
  assert.equal(cleared.liquidPlans.length, 0);
  assert.deepEqual(cleared.archivedLiquidPlans.map((plan) => plan.id), ["archived"]);
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
