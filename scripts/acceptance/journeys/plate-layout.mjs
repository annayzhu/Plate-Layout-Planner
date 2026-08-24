import { resolve } from "node:path";

export async function plateLayoutJourney({ page, outputDirectory, persistWorkspace, readWorkspace }) {
  if (await page.locator(".well").count() !== 24) throw new Error("Initial 24-well plate did not render.");
  if (await page.locator("#plateCanvas > .plate-interaction-help").count() !== 1) throw new Error("Selection guidance is not inside the plate canvas.");

  await page.locator("#projectName").fill("Isolated plate journey");
  await page.locator("#projectName").press("Enter");
  if (!(await page.locator(".plate-tab.active").innerText()).includes("Isolated plate journey")) throw new Error("Enter did not update the active plate tab.");

  await page.locator("#addPlateButton").click();
  await page.locator("#projectName").fill("Control Plate");
  await page.locator("#projectName").press("Enter");
  await page.locator(".plate-tab").first().click();
  await page.locator("#projectName").fill("  control plate  ");
  await page.locator("#projectName").press("Enter");
  if (!(await page.locator("#plateNameError").isVisible())) throw new Error("Duplicate plate name did not show an inline warning.");
  if ((await page.locator(".plate-tab.active span").innerText()).trim() !== "Isolated plate journey") throw new Error("Duplicate plate name replaced the committed tab label.");
  if ((await page.locator("#projectName").getAttribute("aria-invalid")) !== "true") throw new Error("Duplicate plate name was not exposed as invalid to assistive technology.");
  await page.locator("#projectName").fill("Treatment Plate");
  await page.locator("#projectName").press("Enter");
  if (await page.locator("#plateNameError").isVisible()) throw new Error("Plate-name warning remained after entering a unique name.");
  await page.locator('.language-option[data-language="en"]').click();
  await page.locator("#projectName").fill("control plate");
  await page.locator("#projectName").press("Enter");
  if (!(await page.locator("#plateNameError").innerText()).includes("already used")) throw new Error("English duplicate-name warning was not rendered.");
  await page.locator("#projectName").fill("Treatment Plate");
  await page.locator("#projectName").press("Enter");
  await page.locator('.language-option[data-language="zh"]').click();

  await page.locator('[data-well="A1"]').click();
  await page.locator('[data-well="B2"]').click();
  if ((await page.locator("#selectionCount").innerText()) !== "已选 1 孔") throw new Error("Plain click did not replace the selection.");
  await page.locator('[data-well="A1"]').click({ modifiers: ["Control"] });
  if ((await page.locator("#selectionCount").innerText()) !== "已选 2 孔") throw new Error("Ctrl-click did not add a well.");
  await page.locator("#plateCanvas").click({ position: { x: 12, y: 12 } });
  if ((await page.locator("#selectionCount").innerText()) !== "已选 0 孔") throw new Error("Empty-space click did not clear selection.");
  await page.locator('[data-well="A1"]').click();
  await page.locator('[data-well="A3"]').click({ modifiers: ["Shift"] });
  if ((await page.locator("#selectionCount").innerText()) !== "已选 3 孔") throw new Error("Shift-click did not select A1 through A3.");

  for (const [label, value] of [["样本", "Sample-A"], ["处理", "Drug A"], ["原始值", "2"]]) {
    await page.locator(".parameter-input-row").filter({ hasText: label }).locator(".parameter-value").fill(value);
  }
  await page.locator("#applyParametersButton").click();
  const lines = await page.locator('[data-well="A1"] .well-primary, [data-well="A1"] .well-secondary, [data-well="A1"] .well-tertiary').allInnerTexts();
  if (lines.join("|") !== "Sample-A|Drug A|2") throw new Error(`The first three dimensions were not rendered together: ${lines.join("|")}`);

  const clearFixture = await readWorkspace();
  const fixturePlate = clearFixture.plates.find((plate) => plate.id === clearFixture.activePlateId);
  fixturePlate.plates[6].A1 = { params: { sample: "Stored-six-well-value" } };
  fixturePlate.dimensions.push({ id: "calculated", name: "计算结果", type: "number", unit: "µL" });
  fixturePlate.plates[24].A1.params.calculated = 8;
  fixturePlate.calculationOutputs = [{ id: "calculated", sourceId: "value" }];
  fixturePlate.calculationLog = [{ outputId: "calculated" }];
  fixturePlate.liquidPlans = [{ id: "plan-issue-35", name: "Saved plan", status: "saved", stale: false }];
  await persistWorkspace(clearFixture);
  await page.locator('[data-well="A1"]').click();

  await page.locator("#clearPlateLayoutButton").click();
  if (!(await page.locator("#clearPlateLayoutButton").evaluate((button) => button.classList.contains("confirming")))) throw new Error("First clear click did not enter an in-page confirmation state.");
  if (!(await page.locator('[data-well="A1"]').innerText()).includes("Sample-A")) throw new Error("First clear click changed data before confirmation.");
  await page.locator("#clearPlateLayoutButton").click();
  if ((await page.locator('[data-well="A1"]').innerText()).includes("Sample-A")) throw new Error("Clear current plate did not remove assigned well values.");
  if ((await page.locator("#projectName").inputValue()) !== "Treatment Plate") throw new Error("Clear current plate changed the plate name.");
  if (await page.locator(".dimension-row").count() < 6) throw new Error("Clear current plate removed user parameter dimensions.");
  if ((await page.locator("#selectionCount").innerText()) !== "已选 0 孔") throw new Error("Clear current plate did not clear the active selection.");
  const clearedWorkspace = await readWorkspace();
  const clearedState = (() => {
    const workspace = clearedWorkspace;
    const plate = workspace.plates.find((item) => item.id === workspace.activePlateId);
    return {
      plateSize: plate.plateSize,
      allWellMapsEmpty: Object.values(plate.plates).every((wellMap) => Object.keys(wellMap).length === 0),
      dimensionIds: plate.dimensions.map((dimension) => dimension.id),
      calculationLog: plate.calculationLog,
      calculationOutputs: plate.calculationOutputs,
      liquidPlan: plate.liquidPlans[0],
    };
  })();
  if (clearedState.plateSize !== 24 || !clearedState.allWellMapsEmpty) throw new Error(`Clear did not preserve the format or empty all physical-plate maps: ${JSON.stringify(clearedState)}`);
  if (clearedState.dimensionIds.includes("calculated") || clearedState.calculationLog.length || clearedState.calculationOutputs.length) throw new Error("Clear did not remove generated calculation state.");
  if (!clearedState.liquidPlan?.stale || clearedState.liquidPlan?.status !== "stale") throw new Error("Clear did not mark the saved liquid plan stale.");
  await page.locator("#undoButton").click();
  const restoredLines = await page.locator('[data-well="A1"] .well-primary, [data-well="A1"] .well-secondary, [data-well="A1"] .well-tertiary').allInnerTexts();
  if (restoredLines.join("|") !== "Sample-A|Drug A|2") throw new Error("Undo did not restore the cleared plate layout.");
  const restoredWorkspace = await readWorkspace();
  const restoredState = (() => {
    const workspace = restoredWorkspace;
    const plate = workspace.plates.find((item) => item.id === workspace.activePlateId);
    return {
      hiddenValue: plate.plates[6].A1?.params?.sample,
      calculated: plate.plates[24].A1?.params?.calculated,
      calculationOutputs: plate.calculationOutputs,
      liquidPlan: plate.liquidPlans[0],
    };
  })();
  if (restoredState.hiddenValue !== "Stored-six-well-value" || restoredState.calculated !== 8 || restoredState.calculationOutputs.length !== 1 || restoredState.liquidPlan?.stale) throw new Error(`Undo did not restore the complete physical-plate state: ${JSON.stringify(restoredState)}`);
  await page.locator("#clearPlateLayoutButton").click();
  await page.locator("#clearPlateLayoutButton").click();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+z" : "Control+z");
  if (!(await page.locator('[data-well="A1"]').innerText()).includes("Sample-A")) throw new Error("Keyboard undo did not restore the cleared plate layout.");

  for (const size of [6, 12, 24, 96, 384]) {
    await page.locator(`.plate-option[data-size="${size}"]`).click();
    if (await page.locator(".well").count() !== size) throw new Error(`${size}-well option did not render ${size} wells.`);
  }
  await page.locator('.plate-option[data-size="24"]').click();
  await page.locator('.language-option[data-language="en"]').click();
  if (!(await page.locator('.language-option[data-language="en"]').evaluate((button) => button.classList.contains("active")))) throw new Error("English mode did not activate.");
  await page.reload({ waitUntil: "networkidle" });
  if (!(await page.locator('.language-option[data-language="en"]').evaluate((button) => button.classList.contains("active")))) throw new Error("Language choice did not persist.");
  await page.locator('.plate-option[data-size="24"]').focus();
  if (!(await page.locator('.plate-option[data-size="24"]').evaluate((button) => document.activeElement === button))) throw new Error("Plate-format control is not keyboard reachable.");
  await page.setViewportSize({ width: 390, height: 844 });
  const widths = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, page: document.documentElement.scrollWidth }));
  if (widths.page > widths.viewport + 1) throw new Error(`Responsive layout overflowed horizontally: ${JSON.stringify(widths)}`);
  await page.screenshot({ path: resolve(outputDirectory, "isolated-plate-layout.png"), fullPage: true });
  return { wells: 24, language: "en", assignedLines: lines, mobileWidths: widths, keyboardReachable: true };
}
