(function attachLiquidPlanCore(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.LiquidPlanCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createLiquidPlanCore() {
  "use strict";

  const TRANSIENT_INPUT_KEYS = new Set([
    "wellCount", "dilutionWellCount", "groupDimension", "groupRoleLines", "groupOverageLines",
    "overagePercent", "fixedOveragePercent", "dilutionOveragePercent", "solidOveragePercent",
    "cargoName",
  ]);

  function normalizedScalar(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : "";
    if (typeof value === "boolean") return value;
    if (typeof value === "string") return value.trim();
    if (Array.isArray(value)) return value.map(normalizedScalar);
    if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalizedScalar(value[key])]));
    return "";
  }

  function stableRecipeInput(input = {}) {
    return Object.fromEntries(Object.keys(input).filter((key) => !TRANSIENT_INPUT_KEYS.has(key)).sort().map((key) => [key, normalizedScalar(input[key])]));
  }

  function stableStringify(value) {
    return JSON.stringify(normalizedScalar(value));
  }

  function cargoIdentityFor(group) {
    const names = [...new Set((group?.result?.cargos || []).map((cargo) => String(cargo?.name || "").trim()).filter(Boolean))];
    return names.join(" + ") || String(group?.name || "Unnamed cargo").trim();
  }

  function buildTransfectionContributions({ input = {}, plate, planName = "Transfection", groups = [] } = {}) {
    if (!plate?.id) throw new Error("A plate identity is required.");
    const compatibility = stableStringify(stableRecipeInput(input));
    const contributions = [];
    for (const group of groups || []) {
      const cargoIdentity = cargoIdentityFor(group);
      const result = group?.result || {};
      const multiplier = 1 + Math.max(0, Number(result.overagePercent) || 0) / 100;
      for (const row of result.totals || []) {
        const totalVolume = Number(row.totalVolumeUL);
        if (!Number.isFinite(totalVolume) || totalVolume < 0) continue;
        const tubeRole = row.tubeRole === "cargo" || row.cargoDependent === true ? "cargo" : "common";
        const tube = String(row.tube || "Tube").trim();
        const groupKey = tubeRole === "cargo"
          ? `transfection:cargo:${cargoIdentity}:${tube}:${compatibility}`
          : `transfection:common:${tube}:${compatibility}`;
        contributions.push({
          groupKey,
          groupLabel: tubeRole === "cargo" ? `${cargoIdentity} · ${tube}` : `${planName} · ${tube}`,
          tubeRole,
          tube,
          cargoIdentity: tubeRole === "cargo" ? cargoIdentity : "",
          component: String(row.component || "Component"),
          perWellVolume: Number(row.volumeUL) || 0,
          baseVolume: totalVolume / multiplier,
          savedPreparedVolume: totalVolume,
          planOveragePercent: Math.max(0, Number(result.overagePercent) || 0),
          unit: "µL",
          plateId: plate.id,
          plateName: plate.name || plate.id,
          planName,
          groupName: String(group.name || cargoIdentity),
          scopeWellIds: Array.isArray(group.wellIds) ? [...group.wellIds] : [],
          protocolSteps: Array.isArray(group.protocolSteps) ? [...group.protocolSteps] : [],
        });
      }
    }
    return contributions;
  }

  return { stableRecipeInput, buildTransfectionContributions };
});
