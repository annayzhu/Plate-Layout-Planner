import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const playwrightModule = process.env.PLAYWRIGHT_MODULE_URL || "playwright";
let chromium;
try {
  ({ chromium } = await import(playwrightModule));
} catch (error) {
  throw new Error("Visual tests require Playwright. Install it for development or set PLAYWRIGHT_MODULE_URL to its index.mjs file.", { cause: error });
}

const outputDirectory = resolve(process.argv[2] || "artifacts/visual-smoke");
await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}),
});
const page = await browser.newPage({ viewport: { width: 1500, height: 1100 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

try {
  await page.goto("http://127.0.0.1:4186/", { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });

  if (await page.locator(".well").count() !== 24) throw new Error("Initial plate did not render 24 wells.");
  if (await page.locator(".plate-card-heading #selectionCount").count() !== 1) throw new Error("Selection controls are not in the plate's upper-right header.");
  if (await page.locator("#plateCanvas > .plate-interaction-help").count() !== 1) throw new Error("Selection instructions are not inside the plate visualization.");
  const plateNameAffordance = await page.locator("#projectName").evaluate((input) => {
    const style = getComputedStyle(input);
    return { borderBottomStyle: style.borderBottomStyle, cursor: style.cursor };
  });
  if (plateNameAffordance.borderBottomStyle !== "dashed" || plateNameAffordance.cursor !== "text") {
    throw new Error(`Plate name does not visibly communicate editability: ${JSON.stringify(plateNameAffordance)}`);
  }
  const deleteButtonXs = await page.locator(".dimension-delete").evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().x));
  if (Math.max(...deleteButtonXs) - Math.min(...deleteButtonXs) > 1) throw new Error(`Parameter delete buttons were not right-aligned: ${deleteButtonXs.join(",")}`);
  await page.screenshot({ path: resolve(outputDirectory, "01-initial-24-well.png"), fullPage: true });

  await page.locator('[data-well="A1"]').click();
  await page.locator('[data-well="A1"]').click();
  if ((await page.locator("#selectionCount").innerText()) !== "已选 1 孔") throw new Error("Repeated plain click should keep a single well selected.");
  await page.locator('[data-well="B2"]').click();
  if ((await page.locator("#selectionCount").innerText()) !== "已选 1 孔" || !(await page.locator('[data-well="B2"]').evaluate((well) => well.classList.contains("selected")))) {
    throw new Error("Plain click did not replace the previous selection.");
  }
  await page.locator('[data-well="A1"]').click({ modifiers: ["Control"] });
  if ((await page.locator("#selectionCount").innerText()) !== "已选 2 孔") throw new Error("Ctrl-click did not add an individual well.");
  await page.locator("#plateCanvas").click({ position: { x: 12, y: 12 } });
  if ((await page.locator("#selectionCount").innerText()) !== "已选 0 孔") throw new Error("Clicking empty plate space did not clear the selection.");

  await page.locator('[data-well="A1"]').click();
  await page.locator('[data-well="A3"]').click({ modifiers: ["Shift"] });
  if ((await page.locator("#selectionCount").innerText()) !== "已选 3 孔") throw new Error("Shift selection did not select A1-A3.");

  const sampleRow = page.locator(".parameter-input-row").filter({ hasText: "样本" });
  await sampleRow.locator(".parameter-value").fill("Sample-A");
  const treatmentRow = page.locator(".parameter-input-row").filter({ hasText: "处理" });
  await treatmentRow.locator(".parameter-value").fill("Drug A");
  const valueRow = page.locator(".parameter-input-row").filter({ hasText: "原始值" });
  await valueRow.locator(".parameter-value").fill("2");
  await page.locator("#applyParametersButton").click();
  const initialWellLines = await page.locator('[data-well="A1"] .well-primary, [data-well="A1"] .well-secondary, [data-well="A1"] .well-tertiary').allInnerTexts();
  if (initialWellLines.join("|") !== "Sample-A|Drug A|2") throw new Error(`Well did not show the first three assigned parameters in dimension order: ${initialWellLines.join("|")}`);
  for (let move = 0; move < 5; move += 1) {
    await page.locator('.dimension-row[data-dimension="value"] [data-action="up"]').click();
  }
  const reorderedWellLines = await page.locator('[data-well="A1"] .well-primary, [data-well="A1"] .well-secondary, [data-well="A1"] .well-tertiary').allInnerTexts();
  if (reorderedWellLines.join("|") !== "2|Sample-A|Drug A") throw new Error(`Well display did not follow reordered parameters: ${reorderedWellLines.join("|")}`);

  await page.locator("#calcConditionDimension").selectOption("sample");
  await page.locator("#calcConditionValue").fill("Sample-A");
  await page.locator("#calcSource").selectOption("value");
  await page.locator("#constantOperand").fill("5");
  await page.locator("#calcOutputName").fill("校正值");
  const calculationGuide = await page.locator("#calculationGuide").innerText();
  if (!calculationGuide.includes("原始值 × 5 → 校正值") || !calculationGuide.includes("样本") || !calculationGuide.includes("Sample-A")) {
    throw new Error(`Calculation guide did not explain the active formula: ${calculationGuide}`);
  }
  const calculationLabels = await page.locator(".calc-grid label > span").allInnerTexts();
  for (const expectedLabel of ["要计算的数值", "用什么数参与计算", "结果保存为"]) {
    if (!calculationLabels.includes(expectedLabel)) throw new Error(`Missing plain-language calculation label: ${expectedLabel}`);
  }
  await page.locator("#runCalculationButton").click();
  const resultText = await page.locator("#calculationResult").innerText();
  if (!resultText.includes("3 孔已写入")) throw new Error(`Unexpected calculation result: ${resultText}`);
  if (!(await page.locator("#colorDimension option:checked").innerText()).startsWith("校正值")) {
    throw new Error("Plate coloring did not switch to the calculation output.");
  }
  if ((await page.locator('[data-well="A1"] .well-primary').innerText()) !== "2") throw new Error("Color selection unexpectedly replaced the first displayed parameter.");
  if (!resultText.includes("孔板已自动切换") || await page.locator(".calculation-view-result").count() !== 1) {
    throw new Error(`Calculation result did not explain where values were stored: ${resultText}`);
  }
  await page.locator(".calculation-view-result").click();
  if ((await page.locator("#selectionCount").innerText()) !== "已选 1 孔") throw new Error("View-result action did not select a result well.");
  if (await page.locator(".calculation-output-item").count() !== 1 || !(await page.locator(".calculation-output-item").innerText()).includes("将作为一列导出")) {
    throw new Error("First calculation did not create an export-aware result entry.");
  }

  await page.locator('[data-well="A3"]').click({ modifiers: ["Shift"] });
  const secondGuide = await page.locator("#calculationGuide").innerText();
  if (!secondGuide.includes("→ 校正值 2")) throw new Error(`Next calculation name was not made unique: ${secondGuide}`);
  await page.locator("#runCalculationButton").click();
  if (await page.locator(".calculation-output-item").count() !== 2) throw new Error("Second calculation did not create a new result entry.");
  let outputNames = await page.locator(".calculation-output-main strong").allInnerTexts();
  if (outputNames.join("|") !== "校正值|校正值 2") throw new Error(`Unexpected calculation output list: ${outputNames.join("|")}`);
  await page.locator('.calculation-output-item[data-output]').nth(1).locator('[data-action="up"]').click();
  outputNames = await page.locator(".calculation-output-main strong").allInnerTexts();
  if (outputNames.join("|") !== "校正值 2|校正值") throw new Error(`Calculation outputs did not move up: ${outputNames.join("|")}`);
  const exportedResultOrder = await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("plate-layout-studio:project:v1"));
    return saved.dimensions.slice(-2).map((dimension) => dimension.name);
  });
  if (exportedResultOrder.join("|") !== "校正值 2|校正值") throw new Error(`Dimension/export order did not follow result entries: ${exportedResultOrder.join("|")}`);
  const firstOutput = page.locator(".calculation-output-item").first();
  await firstOutput.locator('[data-action="delete"]').click();
  await page.locator('.calculation-output-delete.confirming').click();
  if (await page.locator(".calculation-output-item").count() !== 1 || (await page.locator(".calculation-output-main strong").innerText()) !== "校正值") {
    throw new Error("Deleting a calculation entry did not remove exactly its result column.");
  }
  const deletedResultStillExists = await page.locator(".well").evaluateAll((wells) => wells.some((well) => well.title.includes("校正值 2:")));
  if (deletedResultStillExists) throw new Error("Deleted calculation values still remained in wells.");

  await page.locator("#clearSelectionButton").click();
  await page.locator('[data-well="A1"]').click();
  const selectedWellSummary = await page.locator("#selectedWellSummary").innerText();
  for (const expectedText of ["当前孔位 A1", "Sample-A", "原始值", "2", "校正值", "10"]) {
    if (!selectedWellSummary.includes(expectedText)) throw new Error(`Selected-well summary is missing ${expectedText}: ${selectedWellSummary}`);
  }
  await page.screenshot({ path: resolve(outputDirectory, "02-labeled-and-calculated.png"), fullPage: true });

  await page.locator("#plateCanvas").scrollIntoViewIfNeeded();
  const a1 = await page.locator('[data-well="A1"]').boundingBox();
  const b2 = await page.locator('[data-well="B2"]').boundingBox();
  if (!a1 || !b2) throw new Error("Could not resolve well positions for drag selection.");
  await page.mouse.move(a1.x + a1.width / 2, a1.y + a1.height / 2);
  await page.mouse.down();
  await page.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2, { steps: 8 });
  await page.mouse.up();
  const dragSelectionText = await page.locator("#selectionCount").innerText();
  if (dragSelectionText !== "已选 4 孔") {
    await page.screenshot({ path: resolve(outputDirectory, "debug-drag-selection.png"), fullPage: true });
    const selectedWellIds = await page.locator(".well.selected").evaluateAll((wells) => wells.map((well) => well.dataset.well));
    throw new Error(`Drag selection did not select the 2x2 block: ${dragSelectionText}; selected=${selectedWellIds.join(",")}`);
  }

  await page.locator('.parameter-value[data-dimension="value"]').evaluate((input) => {
    const clipboard = new DataTransfer();
    clipboard.setData("text/plain", "1\n2\n3\n4");
    input.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: clipboard }));
  });
  if (!(await page.locator('.batch-order[data-order="N"]').evaluate((button) => button.classList.contains("active")))) {
    throw new Error("Batch paste did not default to N order.");
  }
  await page.locator(".batch-paste-apply").click();
  const nOrderTitles = {
    A1: await page.locator('[data-well="A1"]').getAttribute("title"),
    B1: await page.locator('[data-well="B1"]').getAttribute("title"),
    A2: await page.locator('[data-well="A2"]').getAttribute("title"),
    B2: await page.locator('[data-well="B2"]').getAttribute("title"),
  };
  for (const [wellId, expected] of [["A1", "原始值: 1"], ["B1", "原始值: 2"], ["A2", "原始值: 3"], ["B2", "原始值: 4"]]) {
    if (!nOrderTitles[wellId]?.includes(expected)) throw new Error(`N-order paste mapping failed for ${wellId}: ${nOrderTitles[wellId]}`);
  }

  await page.locator("#clearSelectionButton").click();
  await page.locator('[data-well="A1"]').click();
  await page.locator('.parameter-value[data-dimension="value"]').evaluate((input) => {
    const clipboard = new DataTransfer();
    clipboard.setData("text/plain", "11\n12\n13\n14");
    input.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: clipboard }));
  });
  const singleAnchorStatus = await page.locator(".batch-paste-head strong").innerText();
  if (!singleAnchorStatus.includes("从 A1 开始") || await page.locator(".batch-paste-apply").isDisabled()) {
    throw new Error(`Single-well anchor paste was not accepted: ${singleAnchorStatus}`);
  }
  await page.locator(".batch-paste-apply").click();
  for (const [wellId, expected] of [["A1", "原始值: 11"], ["B1", "原始值: 12"], ["C1", "原始值: 13"], ["D1", "原始值: 14"]]) {
    const title = await page.locator(`[data-well="${wellId}"]`).getAttribute("title");
    if (!title?.includes(expected)) throw new Error(`Single-anchor N-order paste failed for ${wellId}: ${title}`);
  }
  if ((await page.locator("#selectionCount").innerText()) !== "已选 4 孔") {
    throw new Error("Batch-filled wells were not selected after applying values.");
  }

  await page.locator("#clearSelectionButton").click();
  await page.locator('[data-well="C4"]').click();
  await page.locator('.parameter-value[data-dimension="value"]').evaluate((input) => {
    const clipboard = new DataTransfer();
    clipboard.setData("text/plain", Array.from({ length: 14 }, (_, index) => String(index + 101)).join("\n"));
    input.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: clipboard }));
  });
  const overflowStatus = await page.locator(".batch-paste-head strong").innerText();
  if (!overflowStatus.includes("仅剩 10 个孔") || !overflowStatus.includes("多出 4 个")) {
    throw new Error(`Overflow capacity message was incorrect: ${overflowStatus}`);
  }
  if (!(await page.locator("#applyParametersButton").isDisabled())) {
    throw new Error("The regular assignment button remained enabled during an overflowing batch paste.");
  }
  const omittedPreview = await page.locator(".batch-paste-overflow-values").innerText();
  for (const omittedValue of ["111", "112", "113", "114"]) {
    if (!omittedPreview.includes(omittedValue)) throw new Error(`Overflow preview omitted ${omittedValue}: ${omittedPreview}`);
  }
  if ((await page.locator(".batch-paste-partial").innerText()) !== "仅填前 10 个") {
    throw new Error("Explicit partial-fill action did not show the remaining capacity.");
  }
  await page.screenshot({ path: resolve(outputDirectory, "02b-overflow-paste.png"), fullPage: true });
  await page.locator(".batch-paste-partial").click();
  if ((await page.locator("#selectionCount").innerText()) !== "已选 10 孔") throw new Error("Partial fill did not select all 10 filled wells.");
  for (const [wellId, expected] of [["C4", "原始值: 101"], ["D4", "原始值: 102"], ["A5", "原始值: 103"], ["D6", "原始值: 110"]]) {
    const title = await page.locator(`[data-well="${wellId}"]`).getAttribute("title");
    if (!title?.includes(expected)) throw new Error(`Partial N-order paste failed for ${wellId}: ${title}`);
  }
  const allWellTitles = await page.locator(".well").evaluateAll((wells) => wells.map((well) => well.title));
  if (allWellTitles.some((title) => /\u539f\u59cb\u503c: 11[1-4](?:\D|$)/.test(title))) throw new Error("Overflow values were written without explicit capacity.");

  const sampleNameInput = page.locator('.dimension-row[data-dimension="sample"] .dimension-name-input');
  await sampleNameInput.fill("捐样人ID");
  await sampleNameInput.press("Tab");
  const renamedAssignmentLabel = await page.locator('.parameter-input-row .parameter-value[data-dimension="sample"]').locator("xpath=preceding-sibling::*[1]").innerText();
  if (renamedAssignmentLabel !== "捐样人ID") {
    throw new Error(`Renamed parameter did not update assignment section: ${renamedAssignmentLabel}`);
  }
  const restoredSampleNameInput = page.locator('.dimension-row[data-dimension="sample"] .dimension-name-input');
  await restoredSampleNameInput.fill("样本");
  await restoredSampleNameInput.press("Tab");

  await page.locator('.plate-option[data-size="6"]').click();
  if (await page.locator(".well").count() !== 6) throw new Error("6-well plate did not render 6 wells.");
  await page.locator('.plate-option[data-size="12"]').click();
  if (await page.locator(".well").count() !== 12) throw new Error("12-well plate did not render 12 wells.");
  await page.locator('.plate-option[data-size="96"]').click();
  if (await page.locator(".well").count() !== 96) throw new Error("96-well plate did not render 96 wells.");
  await page.locator('[data-well="A1"]').click();
  await page.locator('.parameter-value[data-dimension="value"]').evaluate((input) => {
    const clipboard = new DataTransfer();
    clipboard.setData("text/plain", Array.from({ length: 96 }, (_, index) => String(index + 1)).join("\n"));
    input.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: clipboard }));
  });
  if (await page.locator(".batch-paste-apply").isDisabled()) throw new Error("96 values from A1 were incorrectly treated as overflow.");
  await page.locator(".batch-paste-apply").click();
  if ((await page.locator("#selectionCount").innerText()) !== "已选 96 孔") throw new Error("96-well batch paste did not select all filled wells.");
  for (const [wellId, expected] of [["A1", "原始值: 1"], ["H1", "原始值: 8"], ["A2", "原始值: 9"], ["H12", "原始值: 96"]]) {
    const title = await page.locator(`[data-well="${wellId}"]`).getAttribute("title");
    if (!title?.includes(expected)) throw new Error(`96-well N-order paste failed for ${wellId}: ${title}`);
  }

  const sampleIds = Array.from({ length: 96 }, (_, index) => `ID${String(index + 1).padStart(3, "0")}`);
  await page.locator("#clearSelectionButton").click();
  await page.locator('[data-well="B3"]').click();
  await page.locator('.parameter-value[data-dimension="sample"]').evaluate((input, ids) => {
    const clipboard = new DataTransfer();
    clipboard.setData("text/plain", ids.join(" "));
    input.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: clipboard }));
  }, sampleIds);
  const spacedOverflowStatus = await page.locator(".batch-paste-head strong").innerText();
  if (!spacedOverflowStatus.includes("仅剩 79 个孔") || !spacedOverflowStatus.includes("多出 17 个")) {
    throw new Error(`Space-separated IDs were not recognized as a 96-value batch at B3: ${spacedOverflowStatus}`);
  }
  if ((await page.locator('.parameter-value[data-dimension="sample"]').inputValue()).includes("ID001 ID002")) {
    throw new Error("Space-separated IDs were inserted into one assignment input.");
  }
  await page.locator(".batch-paste-cancel").click();
  await page.locator('[data-well="A1"]').click();
  await page.locator('.parameter-value[data-dimension="sample"]').evaluate((input, ids) => {
    const clipboard = new DataTransfer();
    clipboard.setData("text/plain", ids.join(" "));
    input.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: clipboard }));
  }, sampleIds);
  await page.locator(".batch-paste-apply").click();
  for (const [wellId, expected] of [["A1", "样本: ID001"], ["H1", "样本: ID008"], ["A2", "样本: ID009"], ["H12", "样本: ID096"]]) {
    const title = await page.locator(`[data-well="${wellId}"]`).getAttribute("title");
    if (!title?.includes(expected)) throw new Error(`Space-separated sample ID mapping failed for ${wellId}: ${title}`);
  }
  await page.screenshot({ path: resolve(outputDirectory, "03-96-well.png"), fullPage: true });
  await page.locator('.plate-option[data-size="384"]').click();
  if (await page.locator(".well").count() !== 384) throw new Error("384-well plate did not render 384 wells.");
  await page.screenshot({ path: resolve(outputDirectory, "04-384-well.png"), fullPage: true });

  await page.locator('.plate-option[data-size="24"]').click();
  await page.reload({ waitUntil: "networkidle" });
  const restoredA1Title = await page.locator('[data-well="A1"]').getAttribute("title");
  if (!restoredA1Title?.includes("Sample-A") || !restoredA1Title.includes("校正值: 10")) {
    throw new Error(`Autosaved well data was not restored: ${restoredA1Title}`);
  }

  const csvDownloadPromise = page.waitForEvent("download");
  await page.locator("#exportCsvButton").click();
  const csvDownload = await csvDownloadPromise;
  if (!csvDownload.suggestedFilename().endsWith("24well.csv")) throw new Error("CSV export filename was unexpected.");

  const svgDownloadPromise = page.waitForEvent("download");
  await page.locator("#exportSvgButton").click();
  const svgDownload = await svgDownloadPromise;
  if (!svgDownload.suggestedFilename().endsWith("24well.svg")) throw new Error("SVG export filename was unexpected.");

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('.language-option[data-language="en"]').click();
  const plateOptionTops = await page.locator(".plate-option").evaluateAll((buttons) => buttons.map((button) => Math.round(button.getBoundingClientRect().top)));
  if (Math.max(...plateOptionTops) - Math.min(...plateOptionTops) > 1) {
    throw new Error(`English plate size buttons wrapped onto multiple lines: ${plateOptionTops.join(", ")}`);
  }
  const colorSelectHeight = await page.locator("#colorDimension").evaluate((select) => select.getBoundingClientRect().height);
  if (colorSelectHeight > 33) throw new Error(`Color parameter select is taller than the compact target: ${colorSelectHeight}px`);
  const toolbarCenters = await page.locator(".plate-heading-tools").evaluate((toolbar) => {
    const elements = [toolbar.querySelector(".selection-actions"), toolbar.querySelector(".color-control"), toolbar.querySelector(".plate-export-actions")];
    return elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return Math.round(rect.top + rect.height / 2);
    });
  });
  if (Math.max(...toolbarCenters) - Math.min(...toolbarCenters) > 2) {
    throw new Error(`Plate controls are not aligned in one row: ${toolbarCenters.join(", ")}`);
  }
  const toolbarHeights = await page.locator(".plate-heading-tools").evaluate((toolbar) => [
    toolbar.querySelector(".selection-actions").getBoundingClientRect().height,
    toolbar.querySelector("#colorDimension").getBoundingClientRect().height,
    toolbar.querySelector(".plate-export-actions button").getBoundingClientRect().height,
  ].map(Math.round));
  if (Math.max(...toolbarHeights) - Math.min(...toolbarHeights) > 2) {
    throw new Error(`Plate control heights are inconsistent: ${toolbarHeights.join(", ")}`);
  }
  await page.screenshot({ path: resolve(outputDirectory, "05-compact-english-header.png"), fullPage: true });
  await page.locator('.language-option[data-language="zh"]').click();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#plateCanvas").scrollIntoViewIfNeeded();
  const pageWidths = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, page: document.documentElement.scrollWidth }));
  if (pageWidths.page > pageWidths.viewport + 1) throw new Error(`Mobile page overflowed horizontally: ${JSON.stringify(pageWidths)}`);
  await page.screenshot({ path: resolve(outputDirectory, "05-mobile-24-well.png"), fullPage: true });

  await page.locator('.language-option[data-language="en"]').click();
  if ((await page.locator(".hero h1").innerText()) !== "Free Plate Layout") throw new Error("English UI did not activate.");
  if (!(await page.locator(".parameter-card summary").innerText()).includes("Parameters")) throw new Error("Dynamic panels were not translated.");
  await page.reload({ waitUntil: "networkidle" });
  if ((await page.locator(".hero h1").innerText()) !== "Free Plate Layout") throw new Error("English preference was not restored after reload.");
  await page.locator('.language-option[data-language="zh"]').click();

  if (errors.length) throw new Error(`Browser errors:\n${errors.join("\n")}`);
  console.log(JSON.stringify({
    title: await page.title(),
    parameterDeleteAlignment: "all delete buttons share the same rightmost column",
    parameterOrdering: "three well lines follow dimension order; coloring does not replace the first line",
    clickSelection: "plain click replaces, Ctrl-click adds, empty-space click clears",
    shiftSelection: "3 wells",
    dragSelection: "4 wells",
    batchPaste: "N-order mapped A1, B1, A2, B2",
    singleAnchorPaste: "A1 start mapped A1, B1, C1, D1 and selected filled wells",
    overflowPaste: "blocked regular apply, previewed 4 omitted values, explicitly filled 10 remaining wells",
    full96Paste: "96 values filled A1 through H12 in N order",
    spacedSampleIds: "96 space-separated IDs detected as a batch; B3 overflowed safely and A1 filled all wells",
    renamedParameter: "assignment label followed parameter rename",
    calculation: resultText,
    calculationGuide: "plain-language labels and live formula preview verified",
    calculationVisibility: "output promoted on plate with a working view-result action",
    calculationEntries: "created two entries, reordered export columns, and deleted one result with its well values",
    selectedWellSummary: "shows all assigned values for A1",
    plateSizes: [6, 12, 24, 96, 384],
    autosave: "restored after reload",
    exports: [csvDownload.suggestedFilename(), svgDownload.suggestedFilename()],
    compactHeader: "well actions, color control, and exports align in one row; English plate options stay on one row",
    editablePlateName: "subtle dashed underline and text cursor expose inline editing without another button",
    interactionHelp: "selection instructions sit inside the plate visualization above the wells",
    mobilePageWidth: pageWidths,
    languageSwitch: "Chinese and English persisted across reload",
    screenshots: outputDirectory,
  }, null, 2));
} finally {
  await browser.close();
}
