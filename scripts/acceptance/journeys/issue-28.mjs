import { resolve } from "node:path";
import { ISSUE_28_TREATMENTS, issue28Workspace } from "../fixtures.mjs";

const EXPECTED_LABELS = [...ISSUE_28_TREATMENTS.map(([name]) => `${name} · A`), "RNAiMAX + siRNA · B"];

async function buildAllPlateSummary(page) {
  await page.locator("#projectLiquidScope").selectOption("all");
  await page.locator("#projectLiquidSummaryButton").click();
}

export async function issue28MergeJourney({ page, persistWorkspace, downloadText, downloadWorkbook, outputDirectory }) {
  await persistWorkspace(issue28Workspace({ legacyDuplicateOnFirstPlate: true }));
  const normalized = await page.evaluate(() => {
    const workspace = JSON.parse(localStorage.getItem("plate-layout-studio:workspace:v2"));
    return { current: workspace.plates[0].liquidPlans.length, archived: workspace.plates[0].archivedLiquidPlans.length };
  });
  if (normalized.current !== 1 || normalized.archived !== 1) throw new Error(`Legacy duplicate did not normalize before aggregation: ${JSON.stringify(normalized)}`);

  await buildAllPlateSummary(page);
  await page.locator("[data-open-liquid-summary]").click();
  const labels = await page.locator("#summaryDrawerContent .operator-preparation-table tbody tr td:nth-child(2)").allInnerTexts();
  const uniqueLabels = labels.filter((value, index) => index === 0 || value !== labels[index - 1]);
  if (uniqueLabels.join("|") !== EXPECTED_LABELS.join("|")) throw new Error(`Compatible preparations were duplicated or missing: ${uniqueLabels.join(" | ")}`);
  const targets = await page.locator("#summaryDrawerContent .operator-preparation-table tbody tr td:nth-child(10)").allInnerTexts();
  if (targets.some((target) => ![1, 2, 3, 4].every((index) => target.includes(`A549-${index}`)))) throw new Error(`Merged rows do not target all four plates: ${targets.join(" | ")}`);

  const csv = await downloadText(() => page.locator('[data-project-liquid-export="csv"]').click());
  for (const label of EXPECTED_LABELS) if (!csv.text.includes(label)) throw new Error(`CSV is missing ${label}.`);
  if (csv.text.includes("transfection:{") || csv.text.includes('"cargoLines"')) throw new Error("CSV exposed an internal compatibility key.");

  const xlsx = await downloadWorkbook(() => page.locator('[data-project-liquid-export="xlsx"]').click());
  const cargoSheet = xlsx.workbook.sheets.find((sheet) => sheet.name === "独立处理液");
  const xlsxLabels = (cargoSheet?.rows || []).slice(1).map((row) => String(row[1] || "")).filter((value, index, values) => value && (index === 0 || value !== values[index - 1]));
  if (xlsxLabels.join("|") !== EXPECTED_LABELS.slice(0, 6).join("|")) throw new Error(`XLSX treatment groups diverged: ${xlsxLabels.join(" | ")}`);
  await page.screenshot({ path: resolve(outputDirectory, "isolated-issue-28-merge.png"), fullPage: true });
  return { labels: uniqueLabels, csv: csv.item.suggestedFilename(), sheets: xlsx.workbook.sheets.map((sheet) => sheet.name) };
}

export async function issue28SplitJourney({ page, persistWorkspace, outputDirectory }) {
  await persistWorkspace(issue28Workspace({ changedPlate: 4, changedTreatment: "NC-FAM" }));
  await buildAllPlateSummary(page);
  const summary = await page.locator("#projectLiquidSummary").innerText();
  if (!summary.includes("每孔组分或体积不同") || summary.includes("transfection:{")) throw new Error(`The split explanation is missing or leaks internals: ${summary}`);
  await page.locator("[data-open-liquid-summary]").click();
  const labels = await page.locator("#summaryDrawerContent .operator-preparation-table tbody tr td:nth-child(2)").allInnerTexts();
  if (labels.filter((label) => label === "NC-FAM · A").length < 2) throw new Error("A real NC-FAM volume difference was incorrectly merged.");
  await page.screenshot({ path: resolve(outputDirectory, "isolated-issue-28-split.png"), fullPage: true });
  return { splitLabelCount: labels.filter((label) => label === "NC-FAM · A").length };
}
