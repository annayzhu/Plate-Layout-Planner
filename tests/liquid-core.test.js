const test = require("node:test");
const assert = require("node:assert/strict");
const Liquid = require("../liquid-core.js");

test("C1V1 dilution includes the configured overage", () => {
  const result = Liquid.calculateDilution({
    kind: "molar",
    stockConcentration: 10,
    stockUnit: "mM",
    targetConcentration: 100,
    targetUnit: "µM",
    totalVolume: 10,
    volumeUnit: "mL",
    overagePercent: 10,
  });
  assert.equal(result.preparedVolumeUL, 11000);
  assert.equal(result.stockVolumeUL, 110);
  assert.equal(result.diluentVolumeUL, 10890);
});

test("solution preparation supports mass and molar targets with purity correction", () => {
  const massResult = Liquid.calculateSolutionMass({ kind: "mass", targetConcentration: 1, targetUnit: "mg/mL", totalVolume: 10, volumeUnit: "mL", purityPercent: 50, overagePercent: 0 });
  assert.equal(massResult.massNg, 20000000);
  const molarResult = Liquid.calculateSolutionMass({ kind: "molar", targetConcentration: 1, targetUnit: "mM", totalVolume: 1, volumeUnit: "mL", molecularWeight: 180, purityPercent: 100, overagePercent: 0 });
  assert.equal(molarResult.massNg, 180000);
});

test("RNAiMAX preset reproduces the accepted 24-well siRNA calculation", () => {
  const result = Liquid.calculateRnaiMaxTransfection({
    wellCount: 36,
    overagePercent: 10,
    finalVolume: 300,
    complexVolume: 30,
    stockConcentration: 10,
    stockUnit: "µM",
    targetValue: 10,
    targetUnit: "nM",
    reagentPerWell: 0.9,
  });
  assert.equal(result.equivalents, 39.6);
  assert.equal(result.cargo.stockVolumeUL, 0.3);
  assert.deepEqual(result.totals.map((row) => row.totalVolumeUL), [11.88, 582.12, 35.64, 558.36]);
  assert.equal(result.cellSuspensionVolumeUL, 270);
});

test("plasmid length enables mass-to-molar conversion", () => {
  const result = Liquid.calculateCargoPerWell({
    name: "Vector",
    type: "plasmid",
    stockConcentration: 500,
    stockUnit: "ng/µL",
    targetMode: "mass-per-well",
    targetValue: 1,
    targetUnit: "µg",
    lengthBp: 5000,
  }, 2000);
  assert.equal(result.stockVolumeUL, 2);
  assert.ok(Math.abs(result.amountPmol - 0.3030303) < 1e-6);
});

test("Lipofectamine 3000 preset keeps DNA/P3000 and lipid in separate tubes", () => {
  const result = Liquid.calculateLipo3000Transfection({
    wellCount: 2,
    overagePercent: 0,
    finalVolume: 2000,
    complexVolume: 250,
    stockConcentration: 500,
    stockUnit: "ng/µL",
    targetMass: 2500,
    targetMassUnit: "ng",
    lipoPerWell: 3.75,
    p3000PerUg: 2,
  });
  assert.equal(result.cargo.stockVolumeUL, 5);
  assert.equal(result.perWell.find((row) => row.component === "P3000").volumeUL, 5);
  assert.equal(result.perWell.find((row) => row.component === "Lipofectamine 3000").tube, "B");
});

test("fold and logarithmic concentration series are deterministic", () => {
  assert.deepEqual(Liquid.generateConcentrationSeries({ high: 100, points: 4, method: "fold", fold: 2 }), [100, 50, 25, 12.5]);
  assert.deepEqual(Liquid.generateConcentrationSeries({ high: 100, low: 1, points: 3, method: "range", scale: "log" }), [100, 10, 1]);
});

test("gradient preparation supports direct and serial strategies", () => {
  const direct = Liquid.calculateGradientPreparation({
    concentrations: [100, 50, 25],
    stockConcentration: 1000,
    volumePerLevel: 100,
    volumeUnit: "µL",
    overagePercent: 0,
    strategy: "direct",
  });
  assert.deepEqual(direct.rows.map((row) => row.transferVolumeUL), [10, 5, 2.5]);
  const serial = Liquid.calculateGradientPreparation({
    concentrations: [100, 50, 25],
    stockConcentration: 1000,
    volumePerLevel: 100,
    volumeUnit: "µL",
    overagePercent: 0,
    strategy: "serial",
  });
  assert.deepEqual(serial.rows.map((row) => row.transferVolumeUL), [17.5, 75, 50]);
  assert.deepEqual(serial.rows.map((row) => row.totalVolumeUL), [175, 150, 100]);
  assert.deepEqual(serial.rows.map((row) => row.retainedVolumeUL), [100, 100, 100]);
});

test("generic transfection supports multiple cargoes and arbitrary premix tubes", () => {
  const result = Liquid.calculateGenericTransfection({
    wellCount: 4,
    overagePercent: 10,
    finalVolume: 500,
    complexVolume: 50,
    cargos: [
      { name: "siZNF436", type: "siRNA", stockConcentration: 10, stockUnit: "µM", targetMode: "final-concentration", targetValue: 20, targetUnit: "nM" },
      { name: "Reporter", type: "plasmid", stockConcentration: 500, stockUnit: "ng/µL", targetMode: "mass-per-well", targetValue: 250, targetUnit: "ng", lengthBp: 5000 },
    ],
    tubes: [
      { name: "A", volumePerWell: 25, components: [{ kind: "cargo", cargoName: "siZNF436" }, { kind: "cargo", cargoName: "Reporter" }, { kind: "diluent", name: "Opti-MEM" }] },
      { name: "B", volumePerWell: 25, components: [{ kind: "fixed", name: "Transfection reagent", volumePerWell: 1.5, dilutionAllowed: false }, { kind: "diluent", name: "Opti-MEM" }] },
    ],
    minimumPipetteVolume: 1,
  });
  assert.equal(result.cargos.length, 2);
  assert.equal(result.perWell.find((row) => row.component === "siZNF436").volumeUL, 1);
  assert.equal(result.perWell.find((row) => row.component === "Reporter").volumeUL, 0.5);
  assert.equal(result.totals.find((row) => row.component === "Transfection reagent").totalVolumeUL, 6.6);
});

test("working solution is proposed first and only applied after confirmation", () => {
  const base = {
    wellCount: 1,
    overagePercent: 0,
    finalVolume: 100,
    complexVolume: 20,
    cargos: [{ name: "siRNA", type: "siRNA", stockConcentration: 10, stockUnit: "µM", targetMode: "final-concentration", targetValue: 10, targetUnit: "nM" }],
    tubes: [{ name: "A", volumePerWell: 20, components: [{ kind: "cargo", cargoName: "siRNA" }, { kind: "diluent", name: "Opti-MEM" }] }],
    minimumPipetteVolume: 1,
  };
  const proposed = Liquid.calculateGenericTransfection(base);
  assert.equal(proposed.workingSolutions[0].applied, false);
  assert.equal(proposed.perWell.find((row) => row.component === "siRNA").volumeUL, 0.1);
  const applied = Liquid.calculateGenericTransfection({ ...base, applyWorkingSolutions: true });
  assert.equal(applied.workingSolutions[0].applied, true);
  assert.equal(applied.perWell.find((row) => row.component === "siRNA working solution").volumeUL, 1);
});

test("drug layout stops without partial assignments when capacity is insufficient", () => {
  const result = Liquid.planDrugGradientLayout({
    plateSize: 6,
    wellIds: ["A1", "A2", "A3", "B1", "B2", "B3"],
    occupiedWellIds: ["A1"],
    drugs: [{ name: "Drug A", high: 100, points: 3, method: "fold", fold: 2, replicates: 2 }],
  });
  assert.equal(result.error, "insufficient-capacity");
  assert.deepEqual(result.assignments, []);
  assert.equal(result.available, 5);
});

test("drug layout uses the requested wells and preserves replicate identity", () => {
  const result = Liquid.planDrugGradientLayout({
    plateSize: 12,
    wellIds: ["A1", "A2", "A3", "A4", "B1", "B2"],
    drugs: [{ name: "Drug A", high: 10, points: 2, method: "fold", fold: 10, replicates: 3 }],
  });
  assert.equal(result.error, null);
  assert.equal(result.assignments.length, 6);
  assert.deepEqual(result.assignments.slice(0, 3).map((row) => row.replicate), [1, 2, 3]);
  assert.deepEqual(result.assignments.slice(0, 3).map((row) => row.concentration), [10, 10, 10]);
});

test("drug preparation uses dosing volume and reports vehicle exposure", () => {
  const result = Liquid.calculateDrugDosingPreparation({
    concentrations: [10, 1],
    stockConcentration: 10000,
    preparationVolume: 1000,
    dosingVolume: 10,
    finalWellVolume: 100,
    stockVehiclePercent: 100,
    overagePercent: 0,
  });
  assert.equal(result.rows[0].dosingSolutionConcentration, 100);
  assert.equal(result.rows[0].stockVolumeUL, 10);
  assert.equal(result.rows[0].finalVehiclePercent, 0.1);
});

test("drug layout can avoid edge wells, disperse replicates, and suggest multiple plates", () => {
  const wells = Array.from({ length: 96 }, (_, index) => `${String.fromCharCode(65 + (index % 8))}${Math.floor(index / 8) + 1}`);
  const result = Liquid.planDrugGradientLayout({
    plateSize: 96,
    wellIds: wells,
    avoidEdges: true,
    disperseReplicates: true,
    controlsPerDrug: 1,
    controlPosition: "end",
    drugs: [{ name: "Drug A", high: 100, points: 8, method: "fold", fold: 2, replicates: 8 }],
  });
  assert.equal(result.error, "insufficient-capacity");
  assert.equal(result.platesNeeded, 2);
  assert.ok(result.candidates.every((wellId) => {
    const [, row, column] = /^([A-Z]+)(\d+)$/.exec(wellId);
    return !["A", "H"].includes(row) && ![1, 12].includes(Number(column));
  }));
});
