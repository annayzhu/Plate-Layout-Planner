import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const LiquidPlan = require("../../liquid-plan-core.js");

export const ISSUE_28_TREATMENTS = Object.freeze([
  ["Mock", "A1"],
  ["NC-FAM", "A2"],
  ["siFBN2-1", "A3"],
  ["siFBN2-2", "B1"],
  ["siFBN2-3", "B2"],
  ["siFBN2-4", "B3"],
]);

const TRANSFECTION_INPUT = Object.freeze({
  preset: "rnai",
  direction: "forward",
  protocolMode: "preset",
  finalVolume: "2000",
  complexVolume: "200",
  stockConcentration: "10",
  stockUnit: "µM",
  targetValue: "10",
  targetUnit: "nM",
  reagentPerWell: "6",
  overagePercent: "10",
  mergeCommonMix: "on",
});

function groupFor([name, wellId]) {
  const mock = name === "Mock";
  const cargoRows = mock
    ? [{ tube: "A", tubeRole: "common", cargoDependent: false, component: "Opti-MEM", volumeUL: 100, totalVolumeUL: 110 }]
    : [
        { tube: "A", tubeRole: "cargo", cargoDependent: true, component: name, volumeUL: 2, totalVolumeUL: 2.2 },
        { tube: "A", tubeRole: "cargo", cargoDependent: true, component: "Opti-MEM", volumeUL: 98, totalVolumeUL: 107.8 },
      ];
  const totals = [
    ...cargoRows,
    { tube: "B", tubeRole: "common", cargoDependent: false, component: "RNAiMAX", volumeUL: 6, totalVolumeUL: 6.6 },
    { tube: "B", tubeRole: "common", cargoDependent: false, component: "Opti-MEM", volumeUL: 94, totalVolumeUL: 103.4 },
  ];
  const perWell = totals.map((row) => ({ tube: row.tube, component: row.component, volumeUL: row.volumeUL }));
  return {
    name,
    wellIds: [wellId],
    role: mock ? "Mock" : "Transfection",
    protocolSteps: LiquidPlan.buildTransfectionProtocol({
      preset: "rnai",
      direction: "forward",
      groupName: name,
      result: { finalVolumeUL: 2000, complexVolumeUL: 200, cellMediumVolumeUL: 1800, perWell },
    }),
    result: {
      overagePercent: 10,
      cargos: mock ? [] : [{ name }],
      totals,
      perWell,
      finalVolumeUL: 2000,
      complexVolumeUL: 200,
      cellMediumVolumeUL: 1800,
    },
  };
}

function plateFixture(index, { changedTreatment = "", legacyDuplicate = false } = {}) {
  const id = `issue31-a549-${index}`;
  const name = `A549-${index}`;
  const groups = ISSUE_28_TREATMENTS.map(groupFor);
  const contributions = LiquidPlan.buildTransfectionContributions({
    input: TRANSFECTION_INPUT,
    plate: { id, name },
    planName: "RNAiMAX + siRNA",
    groups,
  });
  if (changedTreatment) {
    for (const item of contributions.filter((entry) => entry.cargoIdentity === changedTreatment)) {
      item.groupKey += ":deliberate-volume-difference";
      item.compatibilityKey += ":deliberate-volume-difference";
      if (item.compatibilityProfile?.components?.length) item.compatibilityProfile.components[0].perWellVolumeUL += 0.25;
    }
  }
  const executionPlan = LiquidPlan.buildTransfectionExecutionPlanFromContributions({ contributions, language: "zh" });
  const timestamp = new Date(Date.UTC(2026, 7, 23, 12, index, 0)).toISOString();
  const plan = {
    id: `issue31-plan-${index}`,
    name: "RNAiMAX + siRNA",
    module: "transfection",
    status: "saved",
    stale: false,
    input: { ...TRANSFECTION_INPUT, groupDimension: "treatment" },
    scopeWellIds: ISSUE_28_TREATMENTS.map(([, wellId]) => wellId),
    contributions,
    executionPlanVersion: LiquidPlan.EXECUTION_PLAN_VERSION,
    executionPlanSnapshot: executionPlan,
    resultSnapshot: { headers: [], rows: [], warnings: [], checklist: executionPlan.steps.map((step) => step.instruction), executionGroups: groups },
    protocolSnapshot: { steps: executionPlan.steps.map((step) => step.instruction) },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const dimensions = [{ id: "treatment", name: "处理", type: "text", unit: "" }];
  const wells = Object.fromEntries(ISSUE_28_TREATMENTS.map(([treatment, wellId]) => [wellId, { params: { treatment } }]));
  return {
    id,
    name,
    plateSize: 6,
    dimensions,
    plates: { 6: wells, 12: {}, 24: {}, 96: {}, 384: {} },
    colorDimension: "treatment",
    calculationLog: [],
    calculationOutputs: [],
    liquidPlans: legacyDuplicate ? [{ ...plan }, { ...structuredClone(plan), id: `${plan.id}-old`, updatedAt: "2020-01-01T00:00:00.000Z" }] : [plan],
    archivedLiquidPlans: [],
    updatedAt: timestamp,
  };
}

export function issue28Workspace({ changedPlate = 0, changedTreatment = "NC-FAM", legacyDuplicateOnFirstPlate = false } = {}) {
  const plates = Array.from({ length: 4 }, (_, offset) => plateFixture(offset + 1, {
    changedTreatment: changedPlate === offset + 1 ? changedTreatment : "",
    legacyDuplicate: legacyDuplicateOnFirstPlate && offset === 0,
  }));
  return {
    version: 2,
    name: "A549 FBN2",
    activePlateId: plates[0].id,
    plates,
    latestLiquidSummary: null,
    migrationNotices: [],
    updatedAt: new Date(Date.UTC(2026, 7, 23, 13, 0, 0)).toISOString(),
  };
}
