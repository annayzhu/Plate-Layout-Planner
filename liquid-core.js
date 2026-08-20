(function attachLiquidCore(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.LiquidCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createLiquidCore() {
  "use strict";

  const VOLUME_TO_UL = Object.freeze({ nL: 0.001, "µL": 1, uL: 1, mL: 1000, L: 1000000 });
  const MASS_TO_NG = Object.freeze({ ng: 1, "µg": 1000, ug: 1000, mg: 1000000, g: 1000000000 });
  const AMOUNT_TO_PMOL = Object.freeze({ fmol: 0.001, pmol: 1, nmol: 1000, "µmol": 1000000, umol: 1000000 });
  const MOLAR_TO_NM = Object.freeze({ nM: 1, "µM": 1000, uM: 1000, mM: 1000000, M: 1000000000 });
  const MASS_CONC_TO_NG_UL = Object.freeze({ "ng/µL": 1, "ng/uL": 1, "µg/mL": 1, "ug/mL": 1, "µg/µL": 1000, "ug/uL": 1000, "mg/mL": 1000 });

  function finite(value, name, { min = -Infinity, allowZero = true } = {}) {
    const number = Number(value);
    if (!Number.isFinite(number) || number < min || (!allowZero && number === 0)) {
      throw new Error(`${name} must be a valid number${min >= 0 ? ` ≥ ${min}` : ""}.`);
    }
    return number;
  }

  function convert(value, unit, factors, name) {
    const factor = factors[unit];
    if (!factor) throw new Error(`Unsupported ${name} unit: ${unit}`);
    return finite(value, name, { min: 0 }) * factor;
  }

  function volumeToUL(value, unit = "µL") { return convert(value, unit, VOLUME_TO_UL, "volume"); }
  function massToNg(value, unit = "ng") { return convert(value, unit, MASS_TO_NG, "mass"); }
  function amountToPmol(value, unit = "pmol") { return convert(value, unit, AMOUNT_TO_PMOL, "amount"); }

  function concentrationToBase(value, unit, kind) {
    if (kind === "molar") return convert(value, unit, MOLAR_TO_NM, "molar concentration");
    if (kind === "mass") return convert(value, unit, MASS_CONC_TO_NG_UL, "mass concentration");
    if (kind === "percent-vv" || kind === "percent-wv") return finite(value, "percentage", { min: 0 });
    throw new Error(`Unsupported concentration kind: ${kind}`);
  }

  function withOverage(value, overagePercent = 0) {
    return value * (1 + finite(overagePercent, "overage", { min: 0 }) / 100);
  }

  function round(value, digits = 4) {
    const precision = Math.max(0, Math.min(12, Number(digits) || 0));
    return Number(Number(value).toFixed(precision));
  }

  function calculateDilution(options) {
    const kind = options.kind || "molar";
    const stock = concentrationToBase(options.stockConcentration, options.stockUnit, kind);
    const target = concentrationToBase(options.targetConcentration, options.targetUnit, kind);
    if (stock <= 0 || target < 0 || target > stock) throw new Error("Target concentration must be between 0 and the stock concentration.");
    const requestedVolumeUL = options.totalVolume !== undefined
      ? volumeToUL(options.totalVolume, options.volumeUnit || "µL")
      : volumeToUL(options.perWellVolume, options.perWellUnit || "µL") * finite(options.wellCount, "well count", { min: 1, allowZero: false });
    const preparedVolumeUL = withOverage(requestedVolumeUL, options.overagePercent ?? 10);
    const stockVolumeUL = stock === 0 ? 0 : preparedVolumeUL * target / stock;
    return {
      kind,
      requestedVolumeUL: round(requestedVolumeUL),
      preparedVolumeUL: round(preparedVolumeUL),
      stockVolumeUL: round(stockVolumeUL),
      diluentVolumeUL: round(preparedVolumeUL - stockVolumeUL),
      overagePercent: finite(options.overagePercent ?? 10, "overage", { min: 0 }),
    };
  }

  function calculateSolutionMass(options) {
    const kind = options.kind || "mass";
    const preparedVolumeUL = withOverage(volumeToUL(options.totalVolume, options.volumeUnit || "mL"), options.overagePercent ?? 10);
    const purity = finite(options.purityPercent ?? 100, "purity", { min: 0, allowZero: false }) / 100;
    let massNg;
    if (kind === "mass") {
      const targetNgUL = concentrationToBase(options.targetConcentration, options.targetUnit, "mass");
      massNg = targetNgUL * preparedVolumeUL / purity;
    } else {
      const targetNM = concentrationToBase(options.targetConcentration, options.targetUnit, "molar");
      const molecularWeight = finite(options.molecularWeight, "molecular weight", { min: 0, allowZero: false });
      const moles = targetNM * 1e-9 * preparedVolumeUL * 1e-6;
      massNg = moles * molecularWeight * 1e9 / purity;
    }
    return { preparedVolumeUL: round(preparedVolumeUL), massNg: round(massNg), purityPercent: round(purity * 100) };
  }

  function calculateCargoPerWell(cargo, finalVolumeUL) {
    const mode = cargo.targetMode || (cargo.type === "siRNA" ? "final-concentration" : "mass-per-well");
    if (cargo.type === "siRNA" || mode === "pmol-per-well") {
      const stockPmolUL = concentrationToBase(cargo.stockConcentration, cargo.stockUnit || "µM", "molar") / 1000;
      let pmol;
      if (mode === "final-concentration") {
        const finalNM = concentrationToBase(cargo.targetValue, cargo.targetUnit || "nM", "molar");
        pmol = finalNM * finalVolumeUL / 1000;
      } else {
        pmol = amountToPmol(cargo.targetValue, cargo.targetUnit || "pmol");
      }
      return { name: cargo.name || "siRNA", type: "siRNA", amountPmol: pmol, stockVolumeUL: pmol / stockPmolUL };
    }
    const stockNgUL = concentrationToBase(cargo.stockConcentration, cargo.stockUnit || "ng/µL", "mass");
    const massNg = massToNg(cargo.targetValue, cargo.targetUnit || "ng");
    const result = { name: cargo.name || "Plasmid", type: cargo.type || "plasmid", massNg, stockVolumeUL: massNg / stockNgUL };
    if (cargo.lengthBp) {
      const molecularWeight = finite(cargo.lengthBp, "plasmid length", { min: 1, allowZero: false }) * 660;
      result.amountPmol = massNg * 1000 / molecularWeight;
    }
    return result;
  }

  function calculateGenericTransfection(options) {
    const wellCount = finite(options.wellCount, "well count", { min: 1, allowZero: false });
    const overagePercent = finite(options.overagePercent ?? 10, "overage", { min: 0 });
    const equivalents = withOverage(wellCount, overagePercent);
    const finalVolumeUL = volumeToUL(options.finalVolume ?? 300, options.finalVolumeUnit || "µL");
    const complexVolumeUL = volumeToUL(options.complexVolume ?? 30, options.complexVolumeUnit || "µL");
    const minimum = volumeToUL(options.minimumPipetteVolume ?? 1, options.minimumPipetteUnit || "µL");
    const cargos = (options.cargos || []).map((cargo) => calculateCargoPerWell(cargo, finalVolumeUL));
    const cargoByName = new Map(cargos.map((cargo) => [cargo.name, cargo]));
    const workingSolutions = [];
    const perWell = [];

    for (const tube of options.tubes || []) {
      const tubeName = String(tube.name || `Tube ${perWell.length + 1}`);
      const targetVolumeUL = volumeToUL(tube.volumePerWell, tube.volumeUnit || "µL");
      const tubeRows = [];
      for (const component of tube.components || []) {
        if (component.kind === "diluent") continue;
        let componentName = component.name || "Component";
        let volumeUL;
        if (component.kind === "cargo") {
          const cargo = cargoByName.get(component.cargoName);
          if (!cargo) throw new Error(`Unknown cargo in tube ${tubeName}: ${component.cargoName}`);
          componentName = cargo.name;
          volumeUL = cargo.stockVolumeUL;
        } else if (component.kind === "ratio-per-ug") {
          const cargo = cargoByName.get(component.cargoName);
          if (!cargo?.massNg) throw new Error(`${componentName} requires a mass-based cargo reference.`);
          volumeUL = cargo.massNg / 1000 * finite(component.ratio, `${componentName} ratio`, { min: 0 });
        } else {
          volumeUL = volumeToUL(component.volumePerWell, component.volumeUnit || "µL");
        }
        const originalVolumeUL = volumeUL;
        const totalVolumeUL = originalVolumeUL * equivalents;
        const dilutionAllowed = component.dilutionAllowed !== false;
        if (totalVolumeUL > 0 && totalVolumeUL < minimum && dilutionAllowed) {
          const dilutionFactor = Math.max(2, Math.ceil(minimum / totalVolumeUL));
          const applied = options.applyWorkingSolutions === true;
          workingSolutions.push({
            tube: tubeName,
            component: componentName,
            dilutionFactor,
            originalTransferUL: round(totalVolumeUL),
            workingTransferUL: round(totalVolumeUL * dilutionFactor),
            stockForWorkingSolutionUL: round(minimum),
            diluentForWorkingSolutionUL: round(minimum * (dilutionFactor - 1)),
            applied,
          });
          if (applied) {
            volumeUL *= dilutionFactor;
            componentName = `${componentName} working solution`;
          }
        }
        tubeRows.push({ tube: tubeName, component: componentName, volumeUL, dilutionAllowed, originalVolumeUL });
      }
      const usedVolumeUL = tubeRows.reduce((sum, row) => sum + row.volumeUL, 0);
      if (usedVolumeUL > targetVolumeUL + 1e-9) throw new Error(`Components exceed the target volume of tube ${tubeName}.`);
      const diluent = (tube.components || []).find((component) => component.kind === "diluent");
      if (targetVolumeUL - usedVolumeUL > 1e-9 && !diluent) throw new Error(`Tube ${tubeName} needs a diluent component.`);
      perWell.push(...tubeRows);
      if (diluent) perWell.push({ tube: tubeName, component: diluent.name || "Diluent", volumeUL: targetVolumeUL - usedVolumeUL, dilutionAllowed: true });
    }
    const totalTubeVolume = perWell.reduce((sum, row) => sum + row.volumeUL, 0);
    if (Math.abs(totalTubeVolume - complexVolumeUL) > 1e-6) throw new Error("Premix tube volumes do not add up to the configured complex volume.");
    const normalizedPerWell = perWell.map((row) => ({ ...row, volumeUL: round(row.volumeUL) }));
    const totals = normalizedPerWell.map((row) => ({ ...row, totalVolumeUL: round(row.volumeUL * equivalents) }));
    const warnings = totals.filter((row) => row.totalVolumeUL > 0 && row.totalVolumeUL < minimum).map((row) => ({ component: row.component, volumeUL: row.totalVolumeUL, dilutionAllowed: row.dilutionAllowed }));
    return {
      preset: options.preset || "custom",
      direction: options.direction || "reverse",
      wellCount,
      equivalents: round(equivalents),
      overagePercent,
      finalVolumeUL,
      complexVolumeUL,
      cellMediumVolumeUL: round(finalVolumeUL - complexVolumeUL),
      cargos,
      perWell: normalizedPerWell,
      totals,
      warnings,
      workingSolutions,
    };
  }

  function calculateRnaiMaxTransfection(options) {
    const complexVolume = options.complexVolume ?? 30;
    const result = calculateGenericTransfection({
      ...options,
      preset: "rnai-max-sirna",
      finalVolume: options.finalVolume ?? 300,
      complexVolume,
      cargos: [{ name: options.cargoName || "siRNA", type: "siRNA", stockConcentration: options.stockConcentration ?? 10, stockUnit: options.stockUnit || "µM", targetMode: options.targetMode || "final-concentration", targetValue: options.targetValue ?? 10, targetUnit: options.targetUnit || "nM" }],
      tubes: [
        { name: "A", volumePerWell: Number(complexVolume) / 2, components: [{ kind: "cargo", cargoName: options.cargoName || "siRNA" }, { kind: "diluent", name: options.diluentName || "Opti-MEM" }] },
        { name: "B", volumePerWell: Number(complexVolume) / 2, components: [{ kind: "fixed", name: options.reagentName || "RNAiMAX", volumePerWell: options.reagentPerWell ?? 0.9, dilutionAllowed: false }, { kind: "diluent", name: options.diluentName || "Opti-MEM" }] },
      ],
    });
    return { ...result, cargo: result.cargos[0], cellSuspensionVolumeUL: result.cellMediumVolumeUL };
  }

  function calculateLipo3000Transfection(options) {
    const cargoName = options.cargoName || "Plasmid DNA";
    const complexVolume = options.complexVolume ?? 250;
    const result = calculateGenericTransfection({
      ...options,
      preset: "lipo3000-plasmid",
      finalVolume: options.finalVolume ?? 2000,
      complexVolume,
      cargos: [{ name: cargoName, type: "plasmid", stockConcentration: options.stockConcentration ?? 500, stockUnit: options.stockUnit || "ng/µL", targetMode: "mass-per-well", targetValue: options.targetMass ?? 2500, targetUnit: options.targetMassUnit || "ng", lengthBp: options.lengthBp }],
      tubes: [
        { name: "A", volumePerWell: Number(complexVolume) / 2, components: [{ kind: "cargo", cargoName }, { kind: "ratio-per-ug", name: options.enhancerName || "P3000", ratio: options.p3000PerUg ?? 2, cargoName, dilutionAllowed: false }, { kind: "diluent", name: options.diluentName || "Opti-MEM" }] },
        { name: "B", volumePerWell: Number(complexVolume) / 2, components: [{ kind: "fixed", name: options.reagentName || "Lipofectamine 3000", volumePerWell: options.lipoPerWell ?? 3.75, dilutionAllowed: false }, { kind: "diluent", name: options.diluentName || "Opti-MEM" }] },
      ],
    });
    return { ...result, cargo: result.cargos[0], cellSuspensionVolumeUL: result.cellMediumVolumeUL };
  }

  function generateConcentrationSeries(options) {
    const high = finite(options.high, "highest concentration", { min: 0, allowZero: false });
    const points = Math.floor(finite(options.points, "number of points", { min: 2, allowZero: false }));
    let values;
    if ((options.method || "fold") === "fold") {
      const fold = finite(options.fold ?? 2, "dilution fold", { min: 1, allowZero: false });
      if (fold <= 1) throw new Error("Dilution fold must be greater than 1.");
      values = Array.from({ length: points }, (_, index) => high / (fold ** index));
    } else {
      const low = finite(options.low, "lowest concentration", { min: 0 });
      if (low > high) throw new Error("Lowest concentration cannot exceed highest concentration.");
      if ((options.scale || "log") === "linear") {
        const step = (high - low) / (points - 1);
        values = Array.from({ length: points }, (_, index) => high - step * index);
      } else {
        if (low <= 0) throw new Error("Logarithmic series requires a positive lowest concentration.");
        const ratio = (high / low) ** (1 / (points - 1));
        values = Array.from({ length: points }, (_, index) => high / (ratio ** index));
      }
    }
    if (options.direction === "low-to-high") values.reverse();
    return values.map((value) => round(value, 8));
  }

  function calculateGradientPreparation(options) {
    const concentrations = options.concentrations || generateConcentrationSeries(options);
    const stock = finite(options.stockConcentration, "stock concentration", { min: 0, allowZero: false });
    const requestedVolumeUL = volumeToUL(options.volumePerLevel, options.volumeUnit || "µL");
    const preparedVolumeUL = withOverage(requestedVolumeUL, options.overagePercent ?? 10);
    if (concentrations.some((value) => value > stock)) throw new Error("A target concentration exceeds the stock concentration.");
    if ((options.strategy || "direct") === "serial") {
      const rows = new Array(concentrations.length);
      let downstreamTransferUL = 0;
      for (let index = concentrations.length - 1; index >= 0; index -= 1) {
        const totalVolumeUL = preparedVolumeUL + downstreamTransferUL;
        const sourceConcentration = index === 0 ? stock : concentrations[index - 1];
        const transferVolumeUL = totalVolumeUL * concentrations[index] / sourceConcentration;
        rows[index] = {
          level: index + 1,
          concentration: concentrations[index],
          source: index === 0 ? "stock" : `level-${index}`,
          transferVolumeUL: round(transferVolumeUL),
          diluentVolumeUL: round(totalVolumeUL - transferVolumeUL),
          totalVolumeUL: round(totalVolumeUL),
          retainedVolumeUL: round(preparedVolumeUL),
          downstreamTransferUL: round(downstreamTransferUL),
        };
        downstreamTransferUL = transferVolumeUL;
      }
      return { strategy: "serial", concentrations, requestedVolumeUL, preparedVolumeUL: round(preparedVolumeUL), rows };
    }
    const rows = concentrations.map((concentration, index) => {
      const stockVolumeUL = preparedVolumeUL * concentration / stock;
      return { level: index + 1, concentration, source: "stock", transferVolumeUL: round(stockVolumeUL), diluentVolumeUL: round(preparedVolumeUL - stockVolumeUL), totalVolumeUL: round(preparedVolumeUL) };
    });
    return { strategy: "direct", concentrations, requestedVolumeUL, preparedVolumeUL: round(preparedVolumeUL), rows };
  }

  function orderWells(size, wellIds, orientation = "row") {
    const ids = [...wellIds];
    if (orientation !== "column") return ids;
    const rowMajor = ids.map((id) => ({ id, parsed: /^([A-Z]+)(\d+)$/.exec(id) })).filter((entry) => entry.parsed);
    return rowMajor.sort((left, right) => Number(left.parsed[2]) - Number(right.parsed[2]) || left.parsed[1].localeCompare(right.parsed[1])).map((entry) => entry.id);
  }

  function edgeWellIds(wellIds) {
    const parsed = wellIds.map((id) => ({ id, match: /^([A-Z]+)(\d+)$/.exec(id) })).filter((item) => item.match);
    if (!parsed.length) return new Set();
    const rows = parsed.map((item) => item.match[1]);
    const columns = parsed.map((item) => Number(item.match[2]));
    const firstRow = rows.slice().sort()[0];
    const lastRow = rows.slice().sort().at(-1);
    const firstColumn = Math.min(...columns);
    const lastColumn = Math.max(...columns);
    return new Set(parsed.filter((item) => item.match[1] === firstRow || item.match[1] === lastRow || Number(item.match[2]) === firstColumn || Number(item.match[2]) === lastColumn).map((item) => item.id));
  }

  function calculateDrugDosingPreparation(options) {
    const stock = finite(options.stockConcentration, "stock concentration", { min: 0, allowZero: false });
    const preparationVolumeUL = withOverage(volumeToUL(options.preparationVolume, options.preparationVolumeUnit || "µL"), options.overagePercent ?? 10);
    const dosingVolumeUL = volumeToUL(options.dosingVolume, options.dosingVolumeUnit || "µL");
    const finalWellVolumeUL = volumeToUL(options.finalWellVolume, options.finalWellVolumeUnit || "µL");
    if (dosingVolumeUL <= 0 || dosingVolumeUL > finalWellVolumeUL) throw new Error("Dosing volume must be greater than zero and no larger than the final well volume.");
    const stockVehiclePercent = finite(options.stockVehiclePercent ?? 100, "stock vehicle percentage", { min: 0 });
    const rows = (options.concentrations || []).map((concentration, index) => {
      const dosingSolutionConcentration = finite(concentration, "target concentration", { min: 0 }) * finalWellVolumeUL / dosingVolumeUL;
      if (dosingSolutionConcentration > stock) throw new Error("A dosing solution concentration exceeds the stock concentration.");
      const stockVolumeUL = preparationVolumeUL * dosingSolutionConcentration / stock;
      const stockFraction = stockVolumeUL / preparationVolumeUL;
      return {
        level: index + 1,
        concentration: round(concentration, 8),
        dosingSolutionConcentration: round(dosingSolutionConcentration, 8),
        stockVolumeUL: round(stockVolumeUL),
        diluentVolumeUL: round(preparationVolumeUL - stockVolumeUL),
        totalVolumeUL: round(preparationVolumeUL),
        finalVehiclePercent: round(stockFraction * (stockVehiclePercent / 100) * (dosingVolumeUL / finalWellVolumeUL) * 100, 8),
      };
    });
    return { preparationVolumeUL: round(preparationVolumeUL), dosingVolumeUL, finalWellVolumeUL, rows };
  }

  function planDrugGradientLayout(options) {
    const occupied = new Set(options.occupiedWellIds || []);
    const ordered = orderWells(options.plateSize, options.wellIds || [], options.orientation);
    const edges = options.avoidEdges ? edgeWellIds(ordered) : new Set();
    const candidates = ordered.filter((wellId) => !occupied.has(wellId) && !edges.has(wellId));
    const planned = [];
    for (const drug of options.drugs || []) {
      const series = generateConcentrationSeries(drug);
      const replicates = Math.floor(finite(drug.replicates ?? 3, "replicates", { min: 1, allowZero: false }));
      const treatments = [];
      if (options.disperseReplicates) {
        for (let replicate = 1; replicate <= replicates; replicate += 1) {
          for (const concentration of series) treatments.push({ drug: drug.name || "Drug", concentration, replicate, controlType: "treatment" });
        }
      } else {
        for (const concentration of series) for (let replicate = 1; replicate <= replicates; replicate += 1) treatments.push({ drug: drug.name || "Drug", concentration, replicate, controlType: "treatment" });
      }
      const controls = Array.from({ length: Math.max(0, Math.floor(Number(options.controlsPerDrug) || 0)) }, (_, index) => ({ drug: drug.name || "Drug", concentration: 0, replicate: index + 1, controlType: "vehicle" }));
      planned.push(...(options.controlPosition === "start" ? [...controls, ...treatments] : [...treatments, ...controls]));
    }
    const required = planned.length;
    const available = candidates.length;
    const platesNeeded = available ? Math.max(1, Math.ceil(required / available)) : Infinity;
    if (required > available) return { assignments: [], required, available, platesNeeded, candidates, error: "insufficient-capacity" };
    return { assignments: planned.map((item, index) => ({ wellId: candidates[index], ...item })), required, available, platesNeeded, candidates, error: null };
  }

  return {
    VOLUME_TO_UL,
    MASS_TO_NG,
    AMOUNT_TO_PMOL,
    MOLAR_TO_NM,
    MASS_CONC_TO_NG_UL,
    volumeToUL,
    massToNg,
    amountToPmol,
    concentrationToBase,
    withOverage,
    calculateDilution,
    calculateSolutionMass,
    calculateCargoPerWell,
    calculateGenericTransfection,
    calculateRnaiMaxTransfection,
    calculateLipo3000Transfection,
    generateConcentrationSeries,
    calculateGradientPreparation,
    calculateDrugDosingPreparation,
    planDrugGradientLayout,
  };
});
