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

test("fixed-ratio extra-add preparation supports mixed units, multiple reagents, and batch overage", () => {
  const result = Liquid.calculateFixedRatioPreparation({
    meaning: "extra",
    volumeMode: "per-well",
    baseVolume: 100,
    baseUnit: "µL",
    wellCount: 3,
    overagePercent: 10,
    reagents: [
      { name: "CCK-8", referenceVolume: 100, referenceUnit: "µL", reagentVolume: 10, reagentUnit: "µL" },
      { name: "Dye", referenceVolume: 1, referenceUnit: "mL", reagentVolume: 10, reagentUnit: "µL" },
    ],
  });
  assert.equal(result.theoretical.mediumVolumeUL, 100);
  assert.deepEqual(result.theoretical.reagents.map((row) => row.volumeUL), [10, 1]);
  assert.equal(result.theoretical.finalVolumeUL, 111);
  assert.equal(result.equivalentWells, 3.3);
  assert.deepEqual(result.batch.reagents.map((row) => row.volumeUL), [33, 3.3]);
  assert.equal(result.batch.finalVolumeUL, 366.3);
});

test("fixed-ratio final-volume preparation subtracts every reagent from medium", () => {
  const result = Liquid.calculateFixedRatioPreparation({
    meaning: "final",
    volumeMode: "per-well",
    baseVolume: 100,
    baseUnit: "µL",
    wellCount: 2,
    overagePercent: 10,
    reagents: [
      { name: "A", referenceVolume: 100, referenceUnit: "µL", reagentVolume: 10, reagentUnit: "µL" },
      { name: "B", referenceVolume: 100, referenceUnit: "µL", reagentVolume: 1, reagentUnit: "µL" },
    ],
  });
  assert.equal(result.theoretical.mediumVolumeUL, 89);
  assert.equal(result.theoretical.finalVolumeUL, 100);
  assert.equal(result.batch.mediumVolumeUL, 195.8);
  assert.equal(result.batch.finalVolumeUL, 220);
});

test("fixed-ratio direct-total mode and duplicate names remain auditable", () => {
  const result = Liquid.calculateFixedRatioPreparation({
    meaning: "extra",
    volumeMode: "total",
    baseVolume: 12,
    baseUnit: "mL",
    overagePercent: 10,
    reagents: [
      { name: "Dye", referenceVolume: 100, referenceUnit: "µL", reagentVolume: 10, reagentUnit: "µL" },
      { name: "Dye", referenceVolume: 1, referenceUnit: "mL", reagentVolume: 10, reagentUnit: "µL" },
    ],
  });
  assert.equal(result.requestedVolumeUL, 12000);
  assert.deepEqual(result.batch.reagents.map((row) => row.volumeUL), [1320, 132]);
  assert.ok(result.warnings.some((warning) => warning.code === "duplicate-name"));
});

test("fixed-ratio preparation blocks invalid final fractions and supports confirmed working solution", () => {
  assert.throws(() => Liquid.calculateFixedRatioPreparation({
    meaning: "final", volumeMode: "total", baseVolume: 100, baseUnit: "µL",
    reagents: [{ name: "A", referenceVolume: 100, referenceUnit: "µL", reagentVolume: 100, reagentUnit: "µL" }],
  }), /less than 100%/);

  const proposed = Liquid.calculateFixedRatioPreparation({
    meaning: "final", volumeMode: "per-well", baseVolume: 100, baseUnit: "µL", wellCount: 1, overagePercent: 0,
    minimumPipetteVolume: 1,
    reagents: [{ name: "Dye", referenceVolume: 1000, referenceUnit: "µL", reagentVolume: 0.1, reagentUnit: "µL" }],
  });
  assert.equal(proposed.workingSolutions[0].applied, false);
  assert.equal(proposed.batch.reagents[0].volumeUL, 0.01);
  const applied = Liquid.calculateFixedRatioPreparation({
    meaning: "final", volumeMode: "per-well", baseVolume: 100, baseUnit: "µL", wellCount: 1, overagePercent: 0,
    minimumPipetteVolume: 1, applyWorkingSolutions: true,
    reagents: [{ name: "Dye", referenceVolume: 1000, referenceUnit: "µL", reagentVolume: 0.1, reagentUnit: "µL" }],
  });
  assert.equal(applied.workingSolutions[0].applied, true);
  assert.equal(applied.workingSolutions[0].stockForWorkingSolutionUL, 1);
  assert.equal(applied.workingSolutions[0].diluentForWorkingSolutionUL, 99);
  assert.equal(applied.workingSolutions[0].preparedWorkingSolutionUL, 100);
  assert.equal(applied.batch.reagents[0].volumeUL, 1);
  assert.equal(applied.batch.mediumVolumeUL + applied.batch.reagents[0].volumeUL, applied.batch.finalVolumeUL);
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

test("plasmid final concentration uses length to convert molarity into stock mass volume", () => {
  const result = Liquid.calculateCargoPerWell({
    name: "pDNA",
    type: "plasmid",
    stockConcentration: 1000,
    stockUnit: "ng/µL",
    targetMode: "final-concentration",
    targetValue: 10,
    targetUnit: "nM",
    lengthBp: 5000,
  }, 100);
  assert.equal(result.amountPmol, 1);
  assert.equal(result.massNg, 3300);
  assert.equal(result.stockVolumeUL, 3.3);
});

test("molar plasmid stock retains calculated mass for mass-ratio reagents", () => {
  const result = Liquid.calculateGenericTransfection({
    wellCount: 1,
    overagePercent: 0,
    finalVolume: 100,
    complexVolume: 20,
    cargos: [{ name: "pDNA", type: "plasmid", stockConcentration: 1, stockUnit: "µM", targetMode: "final-concentration", targetValue: 10, targetUnit: "nM", lengthBp: 5000 }],
    tubes: [{ name: "A", volumePerWell: 20, components: [
      { kind: "cargo", cargoName: "pDNA" },
      { kind: "ratio-per-ug", name: "P3000", ratio: 2, cargoName: "pDNA" },
      { kind: "diluent", name: "Opti-MEM" },
    ] }],
  });
  assert.equal(result.cargos[0].massNg, 3300);
  assert.equal(result.perWell.find((row) => row.component === "P3000").volumeUL, 6.6);
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
  assert.equal(direct.stockConsumptionUL, 17.5);
  assert.equal(serial.stockConsumptionUL, 17.5);
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

test("transfection allocates a total cargo mixture by mass ratio and supports cargo collections", () => {
  const result = Liquid.calculateGenericTransfection({
    wellCount: 2,
    overagePercent: 0,
    finalVolume: 500,
    complexVolume: 40,
    totalCargoMass: 600,
    totalCargoMassUnit: "ng",
    cargos: [
      { name: "Vector A", type: "plasmid", stockConcentration: 200, stockUnit: "ng/µL", targetMode: "mass-ratio", targetValue: 1 },
      { name: "Vector B", type: "plasmid", stockConcentration: 200, stockUnit: "ng/µL", targetMode: "mass-ratio", targetValue: 2 },
    ],
    tubes: [
      { name: "A", volumePerWell: 20, components: [{ kind: "cargo", cargoName: "all-plasmid" }, { kind: "diluent", name: "Opti-MEM" }] },
      { name: "B", volumePerWell: 20, components: [{ kind: "ratio-volume", name: "Transfection reagent", cargoName: "all-plasmid", ratio: 1 }, { kind: "diluent", name: "Opti-MEM" }] },
    ],
  });
  assert.deepEqual(result.cargos.map((cargo) => cargo.massNg), [200, 400]);
  assert.equal(result.perWell.find((row) => row.tube === "A" && row.component === "All plasmid cargoes").volumeUL, 3);
  assert.equal(result.perWell.find((row) => row.component === "Transfection reagent").volumeUL, 3);
});

test("named cargo subsets reject misspelled or missing members", () => {
  assert.throws(() => Liquid.calculateGenericTransfection({
    wellCount: 1,
    overagePercent: 0,
    finalVolume: 100,
    complexVolume: 20,
    cargos: [{ name: "A", type: "siRNA", stockConcentration: 10, stockUnit: "µM", targetMode: "final-concentration", targetValue: 10, targetUnit: "nM" }],
    tubes: [{ name: "A", volumePerWell: 20, components: [{ kind: "cargo", cargoName: "A+Typo" }, { kind: "diluent", name: "Opti-MEM" }] }],
  }), /Unknown cargo/);
});

test("transfection supports an other cargo with a pmol target when molecular weight is available", () => {
  const result = Liquid.calculateCargoPerWell({
    name: "Synthetic cargo",
    type: "other",
    stockConcentration: 100,
    stockUnit: "ng/µL",
    targetMode: "pmol-per-well",
    targetValue: 2,
    targetUnit: "pmol",
    molecularWeight: 50000,
  }, 300);
  assert.equal(result.amountPmol, 2);
  assert.equal(result.massNg, 100);
  assert.equal(result.stockVolumeUL, 1);
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

test("common master mix components require identical volume and overage settings", () => {
  const row = { tube: "B", component: "RNAiMAX", volumeUL: 0.9, totalVolumeUL: 9.9 };
  const compatible = Liquid.commonTransfectionComponents([
    { overagePercent: 10, finalVolumeUL: 300, complexVolumeUL: 30, totals: [row] },
    { overagePercent: 10, finalVolumeUL: 300, complexVolumeUL: 30, totals: [{ ...row, totalVolumeUL: 19.8 }] },
  ], []);
  assert.deepEqual(compatible, ["B\u0000RNAiMAX"]);
  const incompatible = Liquid.commonTransfectionComponents([
    { overagePercent: 10, finalVolumeUL: 300, complexVolumeUL: 30, totals: [row] },
    { overagePercent: 15, finalVolumeUL: 300, complexVolumeUL: 30, totals: [row] },
  ], []);
  assert.deepEqual(incompatible, []);
  const partiallyCompatible = Liquid.commonTransfectionComponents([
    { overagePercent: 10, finalVolumeUL: 300, complexVolumeUL: 30, totals: [row, { tube: "B", component: "Opti-MEM", volumeUL: 14.1 }] },
    { overagePercent: 10, finalVolumeUL: 300, complexVolumeUL: 30, totals: [row, { tube: "B", component: "Opti-MEM", volumeUL: 13.1 }] },
  ]);
  assert.deepEqual(partiallyCompatible, []);
});

test("cargo collections are never merged into a common master mix", () => {
  const definition = {
    wellCount: 2,
    finalVolume: 100,
    complexVolume: 20,
    overagePercent: 0,
    totalCargoMass: 100,
    totalCargoMassUnit: "ng",
    cargos: [
      { name: "pA", type: "plasmid", stockConcentration: 100, stockUnit: "ng/µL", targetMode: "mass-ratio", targetValue: 1 },
      { name: "pB", type: "plasmid", stockConcentration: 100, stockUnit: "ng/µL", targetMode: "mass-ratio", targetValue: 1 },
    ],
    tubes: [{ name: "A", volumePerWell: 20, components: [
      { kind: "cargo", cargoName: "all-plasmid" },
      { kind: "diluent", name: "Opti-MEM" },
    ] }],
  };
  const first = Liquid.calculateGenericTransfection(definition);
  const second = Liquid.calculateGenericTransfection(definition);
  assert.deepEqual(Liquid.commonTransfectionComponents([first, second]), ["A\u0000Opti-MEM"]);
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

test("edge avoidance uses the physical plate boundary even for an interior selected subset", () => {
  const result = Liquid.planDrugGradientLayout({
    plateSize: 96,
    wellIds: ["B2", "B3", "C2", "C3"],
    avoidEdges: true,
    drugs: [{ name: "Drug A", high: 10, points: 2, method: "fold", fold: 10, replicates: 2 }],
  });
  assert.equal(result.error, null);
  assert.deepEqual(result.candidates, ["B2", "B3", "C2", "C3"]);
});

test("drug layout reserves explicit fixed control wells and reports physical edge fill wells", () => {
  const wells = ["A1", "A2", "A3", "A4", "B1", "B2", "B3", "B4", "C1", "C2", "C3", "C4"];
  const result = Liquid.planDrugGradientLayout({
    plateSize: 12,
    wellIds: wells,
    avoidEdges: true,
    edgeFill: "PBS",
    controlsPerDrug: 1,
    controlPosition: "fixed",
    fixedControlWellIds: ["B2"],
    drugs: [{ name: "Drug A", high: 10, points: 2, method: "fold", fold: 10, replicates: 1 }],
  });
  assert.equal(result.error, "insufficient-capacity");
  assert.deepEqual(result.fillAssignments.map((row) => row.wellId), ["A1", "A2", "A3", "A4", "B1", "B4", "C1", "C2", "C3", "C4"]);

  const enough = Liquid.planDrugGradientLayout({
    plateSize: 24,
    wellIds: ["B2", "B3", "B4", "B5", "C2", "C3", "C4", "C5"],
    controlsPerDrug: 1,
    controlPosition: "fixed",
    fixedControlWellIds: ["B2"],
    drugs: [{ name: "Drug A", high: 10, points: 2, method: "fold", fold: 10, replicates: 1 }],
  });
  assert.equal(enough.error, null);
  assert.equal(enough.assignments.find((row) => row.controlType === "vehicle").wellId, "B2");
  assert.ok(enough.assignments.filter((row) => row.controlType === "treatment").every((row) => row.wellId !== "B2"));
});

test("requesting edge fill reserves and fills physical edge wells without a second toggle", () => {
  const result = Liquid.planDrugGradientLayout({
    plateSize: 12,
    wellIds: ["A1", "A2", "A3", "A4", "B1", "B2", "B3", "B4", "C1", "C2", "C3", "C4"],
    avoidEdges: false,
    edgeFill: "Medium",
    drugs: [{ name: "Drug A", high: 10, points: 2, method: "fold", fold: 10, replicates: 1 }],
  });
  assert.equal(result.error, null);
  assert.deepEqual(result.candidates, ["B2", "B3"]);
  assert.equal(result.fillAssignments.length, 10);
});
