import { resolve } from "node:path";
import { createAcceptanceHarness } from "./harness.mjs";
import { runComprehensiveRegression } from "./journeys/comprehensive-regression.mjs";
import { issue28MergeJourney, issue28SplitJourney } from "./journeys/issue-28.mjs";
import { liquidPlanLifecycleJourney } from "./journeys/liquid-plan-lifecycle.mjs";
import { plateLayoutJourney } from "./journeys/plate-layout.mjs";

export const JOURNEYS = Object.freeze({
  comprehensive: null,
  "plate-layout": plateLayoutJourney,
  "liquid-plan-lifecycle": liquidPlanLifecycleJourney,
  "issue-28-merge": issue28MergeJourney,
  "issue-28-split": issue28SplitJourney,
});

function requestedJourneys() {
  const raw = process.env.ACCEPTANCE_JOURNEYS?.trim();
  const names = raw ? raw.split(",").map((name) => name.trim()).filter(Boolean) : Object.keys(JOURNEYS);
  const unknown = names.filter((name) => !(name in JOURNEYS));
  if (unknown.length) throw new Error(`Unknown acceptance journey: ${unknown.join(", ")}. Available: ${Object.keys(JOURNEYS).join(", ")}`);
  return names;
}

export async function runAcceptanceSuite({
  baseUrl = process.env.ACCEPTANCE_BASE_URL || "http://127.0.0.1:4186/",
  outputDirectory = process.argv[2] || "artifacts/visual-smoke",
  journeys = requestedJourneys(),
} = {}) {
  const output = resolve(outputDirectory);
  const results = [];
  if (journeys.includes("comprehensive")) {
    const started = Date.now();
    await runComprehensiveRegression({ baseUrl, outputDirectory: resolve(output, "comprehensive") });
    results.push({ name: "comprehensive", status: "passed", durationMs: Date.now() - started });
  }

  const isolated = journeys.filter((name) => name !== "comprehensive");
  if (isolated.length) {
    const harness = await createAcceptanceHarness({ baseUrl, outputDirectory: resolve(output, "isolated") });
    try {
      for (const name of isolated) results.push(await harness.runJourney(name, JOURNEYS[name]));
    } finally {
      await harness.close();
    }
  }
  const report = { baseUrl, journeys: results, outputDirectory: output };
  console.log(JSON.stringify(report, null, 2));
  return report;
}
