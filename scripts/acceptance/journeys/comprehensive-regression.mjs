import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createAcceptanceHarness, assertTextOrder } from "../harness.mjs";
import { issue28Workspace } from "../fixtures.mjs";

export async function runComprehensiveRegression({
  baseUrl = process.env.ACCEPTANCE_BASE_URL || "http://127.0.0.1:4186/",
  outputDirectory = process.argv[2] || "artifacts/visual-smoke/comprehensive",
} = {}) {
const harness = await createAcceptanceHarness({ baseUrl, outputDirectory });
const { browser, page, errors, XlsxCore } = harness;

try {
  await harness.openClean();

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
  const typographyScale = await page.evaluate(() => {
    const px = (selector) => Number.parseFloat(getComputedStyle(document.querySelector(selector)).fontSize);
    return {
      body: Number.parseFloat(getComputedStyle(document.body).fontSize),
      pageTitle: px(".hero h1"),
      plateName: px("#projectName"),
      control: px(".plate-option"),
      helper: px(".collapsible-summary p"),
      label: px("label > span"),
    };
  });
  const typographyMinimums = { body: 15, pageTitle: 28, plateName: 20, control: 12, helper: 12, label: 11 };
  for (const [role, minimum] of Object.entries(typographyMinimums)) {
    if (typographyScale[role] < minimum) throw new Error(`Typography role ${role} is too small: ${typographyScale[role]}px < ${minimum}px`);
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
  typographyScale.wellText = await page.locator('[data-well="A1"] .well-primary').evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  if (typographyScale.wellText < 9.5) throw new Error(`Well text is too small: ${typographyScale.wellText}px < 9.5px`);
  for (let move = 0; move < 5; move += 1) {
    await page.locator('.dimension-row[data-dimension="value"] [data-action="up"]').click();
  }
  const reorderedWellLines = await page.locator('[data-well="A1"] .well-primary, [data-well="A1"] .well-secondary, [data-well="A1"] .well-tertiary').allInnerTexts();
  if (reorderedWellLines.join("|") !== "2|Sample-A|Drug A") throw new Error(`Well display did not follow reordered parameters: ${reorderedWellLines.join("|")}`);

  for (const [wellId, treatment] of [["A1", "NC-FAM"], ["A2", "siFBN2-1"]]) {
    await page.locator(`[data-well="${wellId}"]`).click();
    await treatmentRow.locator(".parameter-value").fill(treatment);
    await page.locator("#applyParametersButton").click();
  }
  await page.locator("#colorDimension").selectOption("treatment");
  const treatmentColors = await page.locator('[data-well="A1"], [data-well="A2"]').evaluateAll((wells) => wells.map((well) => well.style.getPropertyValue("--well-border")));
  if (!treatmentColors.every(Boolean) || treatmentColors[0] === treatmentColors[1]) {
    throw new Error(`Distinct treatment categories collided in the plate color registry: ${treatmentColors.join(", ")}`);
  }
  const treatmentLegendColors = await page.locator("#plateLegend .legend-swatch").evaluateAll((swatches) => swatches.map((swatch) => swatch.style.getPropertyValue("--swatch")));
  if (new Set(treatmentLegendColors).size !== treatmentLegendColors.length) throw new Error(`Distinct legend categories reused a color: ${treatmentLegendColors.join(", ")}`);
  await page.locator('[data-well="A1"]').click();
  await page.locator('[data-well="A3"]').click({ modifiers: ["Shift"] });
  await treatmentRow.locator(".parameter-value").fill("Drug A");
  await page.locator("#applyParametersButton").click();

  await page.locator("#clearSelectionButton").click();
  await page.locator('[data-well="A1"]').click();
  await page.locator('[data-well="A4"]').click({ modifiers: ["Shift"] });
  if ((await page.locator("#selectionCount").innerText()) !== "已选 4 孔") throw new Error("Could not establish the four-well calculator scope.");

  await page.locator('.liquid-module-launch[data-liquid-module="transfection"]').click();
  if (await page.locator("#liquidDrawer").isHidden()) throw new Error("Liquid preparation drawer did not open.");
  let transfectionForm = page.locator("#liquidActiveForm");
  if ((await transfectionForm.locator('[name="direction"]').inputValue()) !== "forward") throw new Error("New RNAiMAX calculations do not default to forward transfection.");
  await transfectionForm.locator('[name="direction"]').selectOption("reverse");
  const reverseProtocol = await transfectionForm.locator('[name="protocolSteps"]').inputValue();
  if (!reverseProtocol.includes("先加入 30 µL A+B 复合物") || !reverseProtocol.includes("随后每孔加入 270 µL 细胞悬液") || reverseProtocol.includes("已贴壁细胞")) {
    throw new Error(`Reverse-transfection protocol did not switch to the correct execution order: ${reverseProtocol}`);
  }
  await transfectionForm.locator('[name="direction"]').selectOption("forward");
  const initialWellCount = transfectionForm.locator('[name="wellCount"]');
  if ((await initialWellCount.inputValue()) !== "4" || await initialWellCount.isEditable()) {
    throw new Error("The plate-linked well count was not rendered as a read-only four-well scope.");
  }
  const scopeHelp = await transfectionForm.locator(".liquid-scope-help").innerText();
  if (!scopeHelp.includes("关闭") || !scopeHelp.includes("重新选择")) throw new Error(`Well-count guidance is missing: ${scopeHelp}`);
  await transfectionForm.locator('[name="cargoName"]').fill("custom-siRNA");
  await transfectionForm.locator('[name="overagePercent"]').fill("20");
  await page.locator("#closeLiquidDrawerButton").click();

  await page.locator("#selectAllButton").click();
  await page.locator('.liquid-module-launch[data-liquid-module="transfection"]').click();
  transfectionForm = page.locator("#liquidActiveForm");
  if ((await transfectionForm.locator('[name="wellCount"]').inputValue()) !== "24") throw new Error("Reopening after selecting the full plate did not refresh the well count to 24.");
  const reopenedCargo = await transfectionForm.locator('[name="cargoName"]').inputValue();
  const reopenedOverage = await transfectionForm.locator('[name="overagePercent"]').inputValue();
  if (reopenedCargo !== "custom-siRNA" || reopenedOverage !== "20") {
    throw new Error(`Transfection inputs were not preserved while the plate scope changed: cargo=${reopenedCargo}, overage=${reopenedOverage}.`);
  }
  await transfectionForm.locator('button[type="submit"]').click();
  const liquidResultText = await page.locator("#liquidResultHost").innerText();
  for (const expected of ["8.64 µL", "423.36 µL", "25.92 µL", "406.08 µL"]) {
    if (!liquidResultText.includes(expected)) throw new Error(`Transfection result is missing ${expected}: ${liquidResultText}`);
  }
  if (!liquidResultText.includes("准备 custom-siRNA · A") || !liquidResultText.includes("室温孵育 5 min") || !liquidResultText.includes("已贴壁细胞每孔加入 270 µL 培养基") || !liquidResultText.includes("每孔加入 30 µL custom-siRNA 复合物") || !liquidResultText.includes("24 孔")) {
    throw new Error(`Canonical transfection execution plan is incomplete: ${liquidResultText}`);
  }
  const saveButtonStyle = await page.locator('[data-liquid-action="save"]').evaluate((button) => ({ background: getComputedStyle(button).backgroundColor, color: getComputedStyle(button).color }));
  if (saveButtonStyle.background === "rgba(0, 0, 0, 0)" || saveButtonStyle.color !== "rgb(255, 255, 255)") throw new Error(`Save-to-project is not visually primary: ${JSON.stringify(saveButtonStyle)}`);
  if (await page.locator('[data-liquid-action="print"]').count() !== 1) throw new Error("Liquid results do not expose a Print / PDF action.");
  await page.screenshot({ path: resolve(outputDirectory, "02-liquid-transfection.png"), fullPage: true });
  await page.locator('[data-liquid-action="save"]').click();
  const savedLiquidPlans = await page.evaluate(() => {
    const workspace = JSON.parse(localStorage.getItem("plate-layout-studio:workspace:v2"));
    return workspace.plates.find((plate) => plate.id === workspace.activePlateId)?.liquidPlans || [];
  });
  if (savedLiquidPlans.length !== 1 || savedLiquidPlans[0].module !== "transfection") throw new Error("Transfection recipe was not saved with the project.");
  if (await page.locator("[data-lipo-only]:visible").count()) throw new Error("Lipofectamine-only fields were visible in the RNAiMAX preset.");
  await page.locator("#closeLiquidDrawerButton").click();
  if (!(await page.locator("#savedLiquidPlanList").innerText()).includes("已生效")) throw new Error("A saved transfection plan did not appear as current on the plate page.");
  await page.screenshot({ path: resolve(outputDirectory, "02a-saved-liquid-plan.png"), fullPage: true });
  await page.locator('[data-liquid-plan-name]').fill("A549 transfection");
  await page.locator('[data-liquid-plan-name]').blur();
  if ((await page.locator('[data-liquid-plan-name]').inputValue()) !== "A549 transfection") throw new Error("Saved liquid-plan renaming did not persist in the plate UI.");
  await page.locator('[data-liquid-plan-action="edit"]').click();
  if ((await page.locator('#liquidActiveForm [name="cargoName"]').inputValue()) !== "custom-siRNA") throw new Error("Editing a saved plan did not reload its calculation input.");

  await page.locator('#liquidModuleTabs [data-liquid-module="basic"]').click();
  await page.locator('#liquidActiveForm [name="calculationType"]').selectOption("dilution");
  await page.locator('#liquidActiveForm [name="stockConcentration"]').fill("77");
  await page.locator('#liquidModuleTabs [data-liquid-module="transfection"]').click();
  transfectionForm = page.locator("#liquidActiveForm");
  if ((await transfectionForm.locator('[name="cargoName"]').inputValue()) !== "custom-siRNA") throw new Error("Transfection draft was lost after switching modules.");
  await page.locator('#liquidModuleTabs [data-liquid-module="basic"]').click();
  if ((await page.locator('#liquidActiveForm [name="stockConcentration"]').inputValue()) !== "77") throw new Error("Basic-solution draft was lost after switching modules.");
  await page.locator('#liquidActiveForm [data-liquid-action="reset"]').click();
  if ((await page.locator('#liquidActiveForm [name="stockConcentration"]').inputValue()) !== "10") throw new Error("Reset did not restore only the active module defaults.");

  await page.locator('#liquidModuleTabs [data-liquid-module="transfection"]').click();
  transfectionForm = page.locator("#liquidActiveForm");
  await transfectionForm.locator('[name="preset"]').selectOption("lipo3000");
  if (await page.locator("[data-lipo-only]:visible").count() !== 2) throw new Error("Lipofectamine 3000 fields did not appear after switching presets.");
  await transfectionForm.locator('[name="finalVolume"]').fill("2000");
  await transfectionForm.locator('[name="complexVolume"]').fill("250");
  await transfectionForm.locator('[name="reagentPerWell"]').fill("3.75");
  await transfectionForm.locator('button[type="submit"]').click();
  const lipoResultText = await page.locator("#liquidResultHost").innerText();
  if (!lipoResultText.includes("P3000") || !lipoResultText.includes("Lipofectamine 3000")) throw new Error(`Lipofectamine 3000 two-tube result is incomplete: ${lipoResultText}`);

  await transfectionForm.locator('[name="preset"]').selectOption("custom-one");
  await transfectionForm.locator('[name="finalVolume"]').fill("100");
  await transfectionForm.locator('[name="complexVolume"]').fill("20");
  await transfectionForm.locator('[name="cargoLines"]').fill("siRNA,siRNA,10,µM,final-concentration,0.1,nM,");
  await transfectionForm.locator('[name="tubeLines"]').fill("A,20,siRNA,cargo,,siRNA,yes\nA,20,Transfection reagent,fixed,1,,no\nA,20,Opti-MEM,diluent,,,yes");
  await transfectionForm.locator('[name="workingSolutionMode"]').selectOption("apply");
  await transfectionForm.locator('button[type="submit"]').click();
  const customTransfectionText = await page.locator("#liquidResultHost").innerText();
  if (!customTransfectionText.includes("working solution") || !customTransfectionText.includes("已确认应用")) {
    throw new Error(`Confirmed working-solution calculation was not applied: ${customTransfectionText}`);
  }
  await transfectionForm.locator('[name="groupDimension"]').selectOption("treatment");
  await transfectionForm.locator('[name="groupRoleLines"]').fill("Drug A=Mock");
  await transfectionForm.locator('[name="tubeLines"]').fill("A,20,siGroup,cargo,,siGroup,yes\nA,20,Transfection reagent,ratio-volume,2,siGroup,no\nA,20,Opti-MEM,diluent,,,yes");
  await transfectionForm.locator('button[type="submit"]').click();
  const mockText = await page.locator("#liquidResultHost").innerText();
  if (mockText.includes("无法计算") || mockText.includes("Transfection reagent") || !mockText.includes("Opti-MEM")) {
    throw new Error(`Mock group did not remove all cargo-dependent components and refill with diluent: ${mockText}`);
  }
  await transfectionForm.locator('[name="groupRoleLines"]').fill("Drug A=mock");
  await transfectionForm.locator('button[type="submit"]').click();
  if (!(await page.locator("#liquidResultHost").innerText()).includes("分组角色第 1 行无效")) throw new Error("Invalid group role silently fell back to a transfection group.");
  for (let index = errors.length - 1; index >= 0; index -= 1) if (errors[index].includes("分组角色第 1 行无效")) errors.splice(index, 1);
  await transfectionForm.locator('[name="groupRoleLines"]').fill("Drug A=Transfection");
  await transfectionForm.locator('[name="groupCargoLines"]').fill("Drug A|siGroup,siRNA,10,µM,final-concentration,10,nM,,");
  await transfectionForm.locator('[name="tubeLines"]').fill("A,20,siGroup,cargo,,siGroup,yes\nA,20,Transfection reagent,fixed,1,,no\nA,20,Opti-MEM,diluent,,,yes");
  await transfectionForm.locator('[name="optimizationEnabled"]').selectOption("on");
  await transfectionForm.locator('[name="optimizationLines"]').fill("Low,0.5,0.75\nHigh,2,1.5");
  await transfectionForm.locator('[name="workingSolutionMode"]').selectOption("suggest");
  await transfectionForm.locator('button[type="submit"]').click();
  const optimizedText = await page.locator("#liquidResultHost").innerText();
  for (const expected of ["Drug A · Low", "Drug A · High", "siGroup", "2 个独立变体"]) {
    if (!optimizedText.includes(expected)) throw new Error(`Grouped optimization result is missing ${expected}: ${optimizedText}`);
  }
  await page.screenshot({ path: resolve(outputDirectory, "02c-custom-transfection-and-library.png"), fullPage: true });
  await page.locator('[data-liquid-action="save-preset"]').click();
  const customRecipeIds = await page.locator("[data-liquid-library-select] option").evaluateAll((options) => options.map((option) => option.value).filter((value) => value.startsWith("liquid_")));
  if (customRecipeIds.length !== 1) throw new Error("Saving a reusable recipe did not add one editable library item.");
  await page.locator("[data-liquid-library-select]").selectOption("builtin-rnai");
  await page.locator('[data-liquid-action="copy-preset"]').click();
  const editableRecipeIds = await page.locator("[data-liquid-library-select] option").evaluateAll((options) => options.map((option) => option.value).filter((value) => !value.startsWith("builtin-")));
  if (editableRecipeIds.length !== 2) throw new Error("Copying a built-in recipe did not create an editable recipe.");
  await page.locator("[data-liquid-library-select]").selectOption(editableRecipeIds.at(-1));
  await page.locator('[data-liquid-action="delete-preset"]').click();
  if (await page.locator(`[data-liquid-library-select] option[value="${editableRecipeIds.at(-1)}"]`).count()) throw new Error("Editable recipe was not deleted.");
  const recipeDownloadPromise = page.waitForEvent("download");
  await page.locator('[data-liquid-action="export-presets"]').click();
  const recipeDownload = await recipeDownloadPromise;
  const recipePath = await recipeDownload.path();
  await page.locator("[data-liquid-library-import]").setInputFiles(recipePath);
  if (await page.locator(`[data-liquid-library-select] option[value="${customRecipeIds[0]}"]`).count() !== 1) throw new Error("Exported recipe JSON was not imported back into the library.");

  await page.locator('#liquidModuleTabs [data-liquid-module="basic"]').click();
  const basicForm = page.locator("#liquidActiveForm");
  await basicForm.locator('[name="calculationType"]').selectOption("fixed");
  if ((await basicForm.locator('[name="calculationType"]').inputValue()) !== "fixed" || await basicForm.locator("[data-fixed-reagent-row]").count() !== 1) throw new Error("Basic preparation did not open in the lightweight fixed-ratio task with one editable example.");
  const fixedEditorLayout = await basicForm.locator("[data-fixed-reagent-row]").first().evaluate((row) => {
    const card = row.closest(".liquid-form-card");
    const rowRect = row.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const numberWidths = [...row.querySelectorAll('.fixed-ratio-sentence input[type="number"]')].map((input) => input.getBoundingClientRect().width);
    const unitWidths = [...row.querySelectorAll(".fixed-ratio-sentence select")].map((select) => select.getBoundingClientRect().width);
    return { rowRight: rowRect.right, cardRight: cardRect.right, numberWidths, unitWidths };
  });
  if (fixedEditorLayout.rowRight > fixedEditorLayout.cardRight - 8) throw new Error(`Fixed-ratio reagent row overflowed the form card: ${JSON.stringify(fixedEditorLayout)}`);
  if (fixedEditorLayout.numberWidths.some((width) => width < 72)) throw new Error(`Fixed-ratio numbers are not readable: ${JSON.stringify(fixedEditorLayout)}`);
  if (fixedEditorLayout.unitWidths.some((width) => width < 56)) throw new Error(`Fixed-ratio unit selectors are not usable: ${JSON.stringify(fixedEditorLayout)}`);
  const firstFixedReagent = basicForm.locator("[data-fixed-reagent-row]").first();
  if ((await firstFixedReagent.locator("[data-fixed-reference-label]").innerText()).trim() !== "参照培养基体积") throw new Error("Fixed-ratio reference field is not labeled as medium volume in extra-add mode.");
  await firstFixedReagent.locator('[data-fixed-field="referenceVolume"]').fill("90");
  await firstFixedReagent.locator('[data-fixed-field="reagentVolume"]').fill("10");
  let ratioPreview = await firstFixedReagent.locator("[data-fixed-ratio-preview]").innerText();
  if (!ratioPreview.includes("CCK-8 : 培养基 = 1:9") || !ratioPreview.includes("CCK-8 : 最终体系 = 1:10")) throw new Error(`Extra-add ratio denominators are ambiguous: ${ratioPreview}`);
  await page.screenshot({ path: resolve(outputDirectory, "02f-ratio-denominators.png"), fullPage: true });
  await basicForm.locator('[name="fixedMeaning"]').selectOption("final");
  if ((await firstFixedReagent.locator("[data-fixed-reference-label]").innerText()).trim() !== "参照最终体系体积") throw new Error("Fixed-ratio reference field is not labeled as final-mixture volume in final mode.");
  ratioPreview = await firstFixedReagent.locator("[data-fixed-ratio-preview]").innerText();
  if (!ratioPreview.includes("CCK-8 : 最终体系 = 1:9") || ratioPreview.includes("培养基")) throw new Error(`Final-mixture ratio is not explicit: ${ratioPreview}`);
  await basicForm.locator('[name="fixedMeaning"]').selectOption("extra");
  await firstFixedReagent.locator('[data-fixed-field="referenceVolume"]').fill("100");
  await page.screenshot({ path: resolve(outputDirectory, "02e-fixed-ratio-editor.png"), fullPage: true });
  if ((await basicForm.locator('[name="wellCount"]').inputValue()) !== "24" || await basicForm.locator('[name="wellCount"]').isEditable()) throw new Error("Fixed-ratio plate scope is not a read-only 24-well count.");
  await page.locator('#liquidActiveForm button[type="submit"]').click();
  let basicResultText = await page.locator("#liquidResultHost").innerText();
  for (const expected of ["实际孔数 24", "等效 26.4 孔", "2,640 µL", "264 µL", "2,904 µL"]) if (!basicResultText.includes(expected)) throw new Error(`Fixed-ratio CCK-8 result is missing ${expected}: ${basicResultText}`);
  await page.locator('[data-liquid-action="add-fixed-reagent"]').click();
  const secondReagent = basicForm.locator("[data-fixed-reagent-row]").nth(1);
  await secondReagent.locator('[data-fixed-field="name"]').fill("Dye");
  await secondReagent.locator('[data-fixed-field="referenceVolume"]').fill("1");
  await secondReagent.locator('[data-fixed-field="referenceUnit"]').selectOption("mL");
  await secondReagent.locator('[data-fixed-field="reagentVolume"]').fill("10");
  const multiReagentPreviews = await basicForm.locator("[data-fixed-ratio-preview]").allInnerTexts();
  if (!multiReagentPreviews[0].includes("CCK-8 : 最终体系 = 1:11.1") || !multiReagentPreviews[1].includes("Dye : 最终体系 = 1:111")) {
    throw new Error(`Extra-add final-mixture ratios did not include all reagents: ${JSON.stringify(multiReagentPreviews)}`);
  }
  await basicForm.locator('[name="fixedMeaning"]').selectOption("final");
  await basicForm.locator('button[type="submit"]').click();
  basicResultText = await page.locator("#liquidResultHost").innerText();
  for (const expected of ["理论每孔", "89 µL", "10 µL", "1 µL", "2,349.6 µL", "2,640 µL"]) if (!basicResultText.includes(expected)) throw new Error(`Multi-reagent final-mixture result is missing ${expected}: ${basicResultText}`);
  if (!basicResultText.includes("新计算 · 尚未保存") || !basicResultText.includes("项目仍使用上一次已保存版本")) throw new Error(`Calculated draft did not distinguish itself from the saved project plan: ${basicResultText}`);
  if ((await page.locator('[data-liquid-action="save"]').innerText()).trim() !== "更新已保存方案") throw new Error("A later calculation did not present the save action as an update.");
  await page.locator('[data-liquid-action="save"]').click();
  const replacedLiquidPlanState = await page.evaluate(() => {
    const workspace = JSON.parse(localStorage.getItem("plate-layout-studio:workspace:v2"));
    const plans = workspace.plates.find((plate) => plate.id === workspace.activePlateId)?.liquidPlans || [];
    return { count: plans.length, id: plans[0]?.id, module: plans[0]?.module };
  });
  if (replacedLiquidPlanState.count !== 1 || replacedLiquidPlanState.id !== savedLiquidPlans[0].id || replacedLiquidPlanState.module !== "basic") {
    throw new Error(`Updating a saved plan did not atomically replace it while preserving identity: ${JSON.stringify(replacedLiquidPlanState)}`);
  }
  if (!(await page.locator("#liquidResultHost").innerText()).includes("已保存 · 当前有效")) throw new Error("A successful update did not expose the saved-current state.");
  await page.locator('[data-liquid-action="save-preset"]').click();
  const fixedRecipeId = await page.locator("[data-liquid-library-select]").inputValue();
  await page.locator("#closeLiquidDrawerButton").click();
  await page.locator('.liquid-module-launch[data-liquid-module="basic"]').click();
  if (await page.locator('#liquidActiveForm [name="calculationType"]').count() !== 1) {
    throw new Error(`Reopening the basic calculator did not render its form. Browser errors: ${errors.join(" | ")}; drawer hidden=${await page.locator("#liquidDrawer").getAttribute("hidden")}; content=${(await page.locator("#liquidDrawerContent").innerText()).slice(0, 500)}`);
  }
  if ((await page.locator('#liquidActiveForm [name="fixedMeaning"]').inputValue()) !== "final" || await page.locator("#liquidActiveForm [data-fixed-reagent-row]").count() !== 2) throw new Error("Fixed-ratio draft was not restored after closing and reopening the drawer.");
  await page.locator('#liquidActiveForm [name="calculationType"]').selectOption("dilution");
  await page.locator('#liquidActiveForm button[type="submit"]').click();
  basicResultText = await page.locator("#liquidResultHost").innerText();
  if (!basicResultText.includes("110 µL") || !basicResultText.includes("10,890 µL")) throw new Error(`Routine dilution regression result is incorrect: ${basicResultText}`);
  await page.locator('#liquidActiveForm [name="stockConcentration"]').fill("77");
  await page.locator('#liquidActiveForm [data-liquid-action="reset"]').click();
  if ((await page.locator('#liquidActiveForm [name="stockConcentration"]').inputValue()) !== "10") throw new Error("Reset did not restore the active stock-dilution task.");
  await page.locator('#liquidActiveForm [name="calculationType"]').selectOption("fixed");
  if (await page.locator("#liquidActiveForm [data-fixed-reagent-row]").count() !== 2) throw new Error("Resetting stock dilution erased the fixed-ratio task draft.");
  await page.locator("[data-liquid-library-select]").selectOption(fixedRecipeId);
  await page.locator('[data-liquid-action="load-preset"]').click();
  if (await page.locator('#liquidActiveForm [name="calculationType"]').count() !== 1) {
    throw new Error(`Loading the saved fixed-ratio preset removed the active form. Browser errors: ${errors.join(" | ")}; content=${(await page.locator("#liquidDrawerContent").innerText()).slice(0, 500)}`);
  }
  if ((await page.locator('#liquidActiveForm [name="calculationType"]').inputValue()) !== "fixed" || await page.locator("#liquidActiveForm [data-fixed-reagent-row]").count() !== 2) throw new Error("Saved fixed-ratio recipe did not reload correctly.");
  await page.locator('#liquidActiveForm [data-fixed-reagent-row]').nth(1).locator('[data-liquid-action="remove-fixed-reagent"]').click();
  const tinyReagent = page.locator('#liquidActiveForm [data-fixed-reagent-row]').first();
  await tinyReagent.locator('[data-fixed-field="name"]').fill("Dye");
  await tinyReagent.locator('[data-fixed-field="referenceVolume"]').fill("1000");
  await tinyReagent.locator('[data-fixed-field="reagentVolume"]').fill("0.1");
  await page.locator('#liquidActiveForm [name="fixedVolumeMode"]').selectOption("total");
  await page.locator('#liquidActiveForm [name="fixedBaseVolume"]').fill("100");
  await page.locator('#liquidActiveForm [name="fixedOveragePercent"]').fill("0");
  await page.locator('#liquidActiveForm [name="workingSolutionMode"]').selectOption("apply");
  await page.locator('#liquidActiveForm button[type="submit"]').click();
  if (await page.locator('[data-liquid-action="confirm-basic-working-solution"]').count() !== 1 || !(await page.locator("#liquidResultHost").innerText()).includes("尚未应用")) throw new Error("Working-solution request was applied without a second confirmation.");
  await page.locator('[data-liquid-action="confirm-basic-working-solution"]').click();
  const confirmedWorkingText = await page.locator("#liquidResultHost").innerText();
  for (const expected of ["已确认应用", "1 µL Dye 原液", "99 µL 稀释液", "得到 100 µL", "整批取用 1 µL"]) if (!confirmedWorkingText.includes(expected)) throw new Error(`Confirmed working-solution instructions are missing ${expected}: ${confirmedWorkingText}`);
  if (await page.locator('[data-liquid-action="confirm-basic-working-solution"]').count()) throw new Error("Working solution still requested confirmation after it was explicitly confirmed.");
  await page.locator('[data-liquid-action="add-fixed-reagent"]').click();
  if ((await page.locator('[name="workingSolutionConfirmed"]').inputValue()) !== "no") throw new Error("Adding a reagent preserved a stale working-solution confirmation.");
  const addedReagent = page.locator('#liquidActiveForm [data-fixed-reagent-row]').last();
  await addedReagent.locator('[data-fixed-field="name"]').fill("Second reagent");
  await page.locator('#liquidActiveForm button[type="submit"]').click();
  if (await page.locator('[data-liquid-action="confirm-basic-working-solution"]').count() !== 1) throw new Error("Changed reagent collection did not require a fresh confirmation.");
  await page.locator('[data-liquid-action="confirm-basic-working-solution"]').click();
  await addedReagent.locator('[data-liquid-action="remove-fixed-reagent"]').click();
  if ((await page.locator('[name="workingSolutionConfirmed"]').inputValue()) !== "no") throw new Error("Removing a reagent preserved a stale working-solution confirmation.");
  await page.locator('#liquidActiveForm button[type="submit"]').click();
  if (await page.locator('[data-liquid-action="confirm-basic-working-solution"]').count() !== 1) throw new Error("Removing a reagent did not require a fresh confirmation.");
  await page.locator('[data-liquid-action="confirm-basic-working-solution"]').click();
  await page.locator('[data-liquid-action="save-preset"]').click();
  const confirmedWorkingRecipeId = await page.locator("[data-liquid-library-select]").inputValue();
  await page.locator("#closeLiquidDrawerButton").click();
  await page.locator('.liquid-module-launch[data-liquid-module="basic"]').click();
  if ((await page.locator('[name="workingSolutionConfirmed"]').inputValue()) !== "no") throw new Error("Closing and reopening preserved a stale working-solution confirmation.");
  await page.locator('#liquidActiveForm button[type="submit"]').click();
  if (await page.locator('[data-liquid-action="confirm-basic-working-solution"]').count() !== 1) throw new Error("Reopened working-solution calculation did not require a fresh confirmation.");
  await page.locator("[data-liquid-library-select]").selectOption(confirmedWorkingRecipeId);
  await page.locator('[data-liquid-action="load-preset"]').click();
  if ((await page.locator('[name="workingSolutionConfirmed"]').inputValue()) !== "no") throw new Error("A saved preset restored a stale working-solution confirmation.");
  await page.locator('#liquidActiveForm button[type="submit"]').click();
  if (await page.locator('[data-liquid-action="confirm-basic-working-solution"]').count() !== 1) throw new Error("Loaded working-solution preset did not require a fresh confirmation.");

  const recipeCountBeforeLegacyImport = await page.locator("[data-liquid-library-select] option").count();
  await page.locator("[data-liquid-library-import]").setInputFiles({
    name: "legacy-basic-recipes.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ recipes: [
      { id: "legacy-dilution", module: "basic", name: "Legacy dilution", input: { kind: "molar", stockConcentration: "42", stockUnit: "mM", targetConcentration: "2", targetUnit: "µM", volumeMode: "total", totalVolume: "5", volumeUnit: "mL", overagePercent: "7" } },
      { id: "legacy-solid", module: "basic", name: "Legacy solid", input: { calculationType: "solid", kind: "mass", targetConcentration: "3", targetUnit: "mg/mL", totalVolume: "4", volumeUnit: "mL", purityPercent: "95", overagePercent: "8" } },
    ] })),
  });
  await page.waitForFunction((expected) => document.querySelectorAll("[data-liquid-library-select] option").length >= expected, recipeCountBeforeLegacyImport + 2);
  const legacyRecipeIds = await page.locator("[data-liquid-library-select] option").evaluateAll((options) => options.slice(-2).map((option) => option.value));
  await page.locator("[data-liquid-library-select]").selectOption(legacyRecipeIds[0]);
  await page.locator('[data-liquid-action="load-preset"]').click();
  const migratedDilutionValues = await page.locator("#liquidActiveForm").evaluate((form) => ({ task: form.elements.calculationType.value, stock: form.elements.stockConcentration.value, overage: form.elements.dilutionOveragePercent.value }));
  if (migratedDilutionValues.task !== "dilution" || migratedDilutionValues.stock !== "42" || migratedDilutionValues.overage !== "7") throw new Error(`Legacy basic recipe without a task was not migrated to stock dilution: ${JSON.stringify(migratedDilutionValues)}`);
  await page.locator("[data-liquid-library-select]").selectOption(legacyRecipeIds[1]);
  await page.locator('[data-liquid-action="load-preset"]').click();
  if ((await page.locator('#liquidActiveForm [name="calculationType"]').inputValue()) !== "solid" || (await page.locator('#liquidActiveForm [name="solidKind"]').inputValue()) !== "mass" || (await page.locator('#liquidActiveForm [name="solidTargetConcentration"]').inputValue()) !== "3" || (await page.locator('#liquidActiveForm [name="solidOveragePercent"]').inputValue()) !== "8") throw new Error("Legacy weighed-material recipe was not migrated to the new field names.");

  await page.locator('#liquidModuleTabs [data-liquid-module="serial"]').click();
  await page.locator('#liquidActiveForm [name="strategy"]').selectOption("serial");
  await page.locator('#liquidActiveForm [name="points"]').fill("3");
  await page.locator('#liquidActiveForm [name="volumePerLevel"]').fill("100");
  await page.locator('#liquidActiveForm [name="overagePercent"]').fill("0");
  await page.locator('#liquidActiveForm button[type="submit"]').click();
  if (await page.locator("#liquidResultHost .liquid-table tbody tr").count() !== 3) throw new Error("Serial dilution did not produce three concentration levels.");
  const serialText = await page.locator("#liquidResultHost").innerText();
  for (const expected of ["175 µL", "150 µL", "100 µL", "最终保留"]) if (!serialText.includes(expected)) throw new Error(`Backward serial-volume calculation is missing ${expected}: ${serialText}`);
  if (!serialText.includes("母液消耗比较")) throw new Error(`Serial dilution did not compare stock consumption: ${serialText}`);
  await page.locator("#closeLiquidDrawerButton").click();

  await page.locator("#clearSelectionButton").click();
  await page.locator('[data-well="A1"]').click();
  await page.locator('[data-well="D1"]').click({ modifiers: ["Control"] });
  await page.locator('[data-well="D2"]').click({ modifiers: ["Control"] });
  await page.locator('[data-well="D3"]').click({ modifiers: ["Control"] });
  await page.locator('.liquid-module-launch[data-liquid-module="serial"]').click();
  await page.locator('#liquidActiveForm [name="mapToPlate"]').selectOption("on");
  await page.locator('#liquidActiveForm [name="replicates"]').fill("1");
  await page.locator('#liquidActiveForm button[type="submit"]').click();
  if (await page.locator(".liquid-preview-well").count() !== 3 || await page.locator('[data-liquid-action="apply-serial-layout"]').count() !== 1) {
    throw new Error("Serial concentration mapping did not create a three-well preview and confirmation action.");
  }
  if (!(await page.locator("#liquidResultHost").innerText()).includes("排除 1 个已有内容")) throw new Error("Serial preview did not explain that one populated well was excluded.");
  await page.locator('[data-liquid-action="apply-serial-layout"]').click();
  const d1SerialTitle = await page.locator('[data-well="D1"]').getAttribute("title");
  if (!d1SerialTitle?.includes("目标浓度")) throw new Error(`Confirmed serial layout was not written to D1: ${d1SerialTitle}`);

  if (await page.locator("#clearSelectionButton").isEnabled()) await page.locator("#clearSelectionButton").click();
  await page.locator('.liquid-module-launch[data-liquid-module="drug"]').click();
  await page.locator('[name="drugLines"]').fill("Drug A,10000,100,0.78,8,2,2");
  await page.locator('#liquidActiveForm button[type="submit"]').click();
  if (await page.locator(".liquid-preview-well").count() !== 16 || await page.locator('[data-liquid-action="apply-layout"]').count() !== 1) {
    throw new Error("Drug gradient did not generate a 16-well preview with an explicit confirm action.");
  }
  await page.locator('[name="drugLines"]').fill("Drug A,10000,10,1,4,range,log,1,10,DMSO,100");
  await page.locator('[name="avoidEdges"]').selectOption("on");
  await page.locator('[name="controlsPerDrug"]').fill("1");
  await page.locator('#liquidActiveForm button[type="submit"]').click();
  const drugResultText = await page.locator("#liquidResultHost").innerText();
  if (!drugResultText.includes("加药液浓度") || !drugResultText.includes("孔内溶剂终比例") || await page.locator(".liquid-preview-well").count() !== 5) {
    throw new Error(`Drug-specific dosing, vehicle, controls, or edge-safe layout is incomplete: ${drugResultText}`);
  }
  await page.locator('[name="controlPosition"]').selectOption("fixed");
  await page.locator('[name="fixedControlWells"]').fill("B2");
  await page.locator('[name="avoidEdges"]').selectOption("off");
  await page.locator('[name="edgeFill"]').selectOption("PBS");
  await page.locator('#liquidActiveForm button[type="submit"]').click();
  const fixedDrugPreview = await page.locator("#liquidResultHost").innerText();
  if (!fixedDrugPreview.includes("B2") || !fixedDrugPreview.includes("PBS") || await page.locator('[data-liquid-action="apply-layout"]').count() !== 1) {
    throw new Error(`Fixed control or edge-fill preview is incomplete: ${fixedDrugPreview}`);
  }
  await page.locator('[data-liquid-action="apply-layout"]').click();
  const b2DrugTitle = await page.locator('[data-well="B2"]').getAttribute("title");
  if (!b2DrugTitle?.includes("vehicle")) throw new Error(`Fixed vehicle control was not written to B2: ${b2DrugTitle}`);
  await page.screenshot({ path: resolve(outputDirectory, "02d-drug-dosing-and-layout.png"), fullPage: true });

  if (await page.locator("#clearSelectionButton").isEnabled()) await page.locator("#clearSelectionButton").click();
  await page.locator('[data-well="A1"]').click();
  const selectedWellSummary = await page.locator("#selectedWellSummary").innerText();
  for (const expectedText of ["当前孔位 A1", "Sample-A", "原始值", "2"]) {
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
  if (!restoredA1Title?.includes("Sample-A") || !restoredA1Title.includes("原始值: 1")) {
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

  await page.locator("#openProjectImportButton").click();
  const projectTemplateDownloadPromise = page.waitForEvent("download");
  await page.locator("#projectTemplateButton").click();
  const projectTemplateDownload = await projectTemplateDownloadPromise;
  if (!projectTemplateDownload.suggestedFilename().endsWith("_import-template.xlsx")) throw new Error(`Project template filename was unexpected: ${projectTemplateDownload.suggestedFilename()}`);
  const projectTemplateWorkbook = await XlsxCore.parseWorkbook(await readFile(await projectTemplateDownload.path()));
  if (!projectTemplateWorkbook.sheets.some((sheet) => sheet.name === "使用说明") || !projectTemplateWorkbook.sheets.some((sheet) => sheet.rows?.[0]?.[0] === "孔位")) throw new Error("Project XLSX template is missing instructions or a plate worksheet.");
  const templateDownloadPromise = page.waitForEvent("download");
  await page.locator("#excelTemplateButton").click();
  const templateDownload = await templateDownloadPromise;
  if (templateDownload.suggestedFilename() !== "未命名孔板_24well_CSV模板.csv") {
    throw new Error(`CSV template filename was unexpected: ${templateDownload.suggestedFilename()}`);
  }
  const templatePath = await templateDownload.path();
  const templateCsv = await readFile(templatePath, "utf8");
  const expectedTemplateStart = "\uFEFF孔位,样本,处理,剂量 (μM),时间点 (h),重复,原始值\r\nA1,S001,Drug A,1,24,1,\r\nA2,S002,Drug A,1,24,2,";
  if (!templateCsv.startsWith(expectedTemplateStart) || !templateCsv.includes("\r\nD6,,,,,,")) {
    throw new Error(`Excel template content was unexpected: ${templateCsv.slice(0, 180)}`);
  }
  await page.locator("#closeProjectFileDialogButton").click();

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('.language-option[data-language="en"]').click();
  const plateOptionTops = await page.locator(".plate-option").evaluateAll((buttons) => buttons.map((button) => Math.round(button.getBoundingClientRect().top)));
  if (Math.max(...plateOptionTops) - Math.min(...plateOptionTops) > 1) {
    throw new Error(`English plate size buttons wrapped onto multiple lines: ${plateOptionTops.join(", ")}`);
  }
  const colorSelectHeight = await page.locator("#colorDimension").evaluate((select) => select.getBoundingClientRect().height);
  if (colorSelectHeight > 36) throw new Error(`Color parameter select is taller than the readable compact target: ${colorSelectHeight}px`);
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
  await page.locator('.liquid-module-launch[data-liquid-module="transfection"]').click();
  const englishScopeHelp = (await page.locator(".liquid-scope-help").innerText()).toLowerCase();
  if (!englishScopeHelp.includes("close") || !englishScopeHelp.includes("reselect")) {
    throw new Error(`English well-count guidance is incomplete: ${englishScopeHelp}`);
  }
  await page.locator("#closeLiquidDrawerButton").click();
  await page.screenshot({ path: resolve(outputDirectory, "05-compact-english-header.png"), fullPage: true });
  await page.locator('.language-option[data-language="zh"]').click();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#plateCanvas").scrollIntoViewIfNeeded();
  const pageWidths = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, page: document.documentElement.scrollWidth }));
  if (pageWidths.page > pageWidths.viewport + 1) throw new Error(`Mobile page overflowed horizontally: ${JSON.stringify(pageWidths)}`);
  const mobileTypography = await page.evaluate(() => ({
    body: Number.parseFloat(getComputedStyle(document.body).fontSize),
    helper: Number.parseFloat(getComputedStyle(document.querySelector(".plate-interaction-help")).fontSize),
  }));
  if (mobileTypography.body < 15 || mobileTypography.helper < 11) throw new Error(`Mobile typography regressed: ${JSON.stringify(mobileTypography)}`);
  await page.screenshot({ path: resolve(outputDirectory, "05-mobile-24-well.png"), fullPage: true });
  await page.locator('.liquid-module-launch[data-liquid-module="basic"]').click();
  await page.locator('#liquidActiveForm [name="calculationType"]').selectOption("fixed");
  const mobileDrawerWidths = await page.locator("#liquidDrawer").evaluate((drawer) => ({ client: drawer.clientWidth, scroll: drawer.scrollWidth }));
  if (mobileDrawerWidths.scroll > mobileDrawerWidths.client + 1) {
    throw new Error(`Mobile liquid drawer overflowed horizontally: ${JSON.stringify(mobileDrawerWidths)}`);
  }
  if (await page.locator(".liquid-scope-help:visible").count() !== 1) throw new Error("Mobile liquid drawer hid the plate-scope guidance.");
  if (!(await page.locator("[data-fixed-reagent-row]").first().isVisible())) throw new Error("Mobile liquid drawer hid the fixed-ratio reagent editor.");
  const mobileFixedLayout = await page.locator("[data-fixed-reagent-row]").first().evaluate((row) => {
    const cardRect = row.closest(".liquid-form-card").getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const numberWidths = [...row.querySelectorAll('.fixed-ratio-sentence input[type="number"]')].map((input) => input.getBoundingClientRect().width);
    return { rowRight: rowRect.right, cardRight: cardRect.right, numberWidths };
  });
  if (mobileFixedLayout.rowRight > mobileFixedLayout.cardRight - 8 || mobileFixedLayout.numberWidths.some((width) => width < 72)) {
    throw new Error(`Mobile fixed-ratio editor is clipped or unreadable: ${JSON.stringify(mobileFixedLayout)}`);
  }
  await page.screenshot({ path: resolve(outputDirectory, "05b-mobile-liquid-drawer.png"), fullPage: true });
  await page.locator("#closeLiquidDrawerButton").click();
  await page.locator('[data-liquid-plan-action="clear"]').click();
  if (!(await page.locator('[data-liquid-plan-action="clear"]').innerText()).includes("确认")) throw new Error("Clearing a saved plan did not use the inline two-step confirmation.");
  await page.locator('[data-liquid-plan-action="clear"]').click();
  if ((await page.locator("#savedLiquidPlanCount").innerText()).trim() !== "0") throw new Error("Confirmed saved-plan clearing did not remove the plan.");
  await page.locator("#undoButton").click();
  if ((await page.locator("#savedLiquidPlanCount").innerText()).trim() !== "1") throw new Error("Undo did not restore a cleared saved plan.");

  await page.locator('.language-option[data-language="en"]').click();
  if ((await page.locator(".hero h1").innerText()) !== "Free Plate Layout") throw new Error("English UI did not activate.");
  if (!(await page.locator(".parameter-card summary").innerText()).includes("Parameters")) throw new Error("Dynamic panels were not translated.");
  await page.reload({ waitUntil: "networkidle" });
  if ((await page.locator(".hero h1").innerText()) !== "Free Plate Layout") throw new Error("English preference was not restored after reload.");
  await page.locator('.language-option[data-language="zh"]').click();

  await page.setViewportSize({ width: 1440, height: 1000 });
  const importCsv = [
    "\uFEFF孔位,样本,处理,剂量 (μM),时间点 (h),备注",
    "A1,S001,Drug A,1,24,对照",
    "A2,S002,Drug B,2.5,48,\"含,逗号\"",
    "C4,S012,Control,0,24,",
  ].join("\r\n");
  if ((await page.locator("#exportXlsxButton").innerText()).trim() !== "导出项目 XLSX") throw new Error("Project XLSX export is not explicitly scoped.");
  await page.locator("#openProjectImportButton").click();
  if (!(await page.locator("#projectFileDialogHelp").innerText()).includes("XLSX")) throw new Error("Spreadsheet import panel does not explain multi-plate XLSX.");
  await page.locator("#importJsonInput").setInputFiles({ name: "实验板_12well.csv", mimeType: "text/csv", buffer: Buffer.from(importCsv) });
  await page.waitForFunction(() => document.querySelector("#importPreview")?.textContent?.includes("实验板"));
  if (!(await page.locator("#importPreview").innerText()).includes("实验板")) throw new Error("Spreadsheet import preview did not expose the incoming plate.");
  await page.locator("#confirmImportButton").click();
  if (await page.locator(".well").count() !== 12) throw new Error("CSV import did not switch to the inferred 12-well plate.");
  if ((await page.locator("#projectName").inputValue()) !== "实验板") throw new Error("CSV filename did not become the imported plate name.");
  const importedA2Title = await page.locator('[data-well="A2"]').getAttribute("title");
  for (const expected of ["样本: S002", "处理: Drug B", "剂量 (μM): 2.5", "时间点 (h): 48", "备注: 含,逗号"]) {
    if (!importedA2Title?.includes(expected)) throw new Error(`CSV import lost ${expected}: ${importedA2Title}`);
  }
  if ((await page.locator('.dimension-row[data-dimension="dose"] .dimension-unit-input').inputValue()) !== "μM") throw new Error("CSV unit μM was not imported.");
  await page.screenshot({ path: resolve(outputDirectory, "06-spreadsheet-import.png"), fullPage: true });

  const legacyProject = {
    version: 1,
    name: "Legacy project",
    plateSize: 6,
    dimensions: [{ id: "sample", name: "样本", type: "text" }],
    plates: { 6: { A1: { params: { sample: "Legacy-A" } } } },
    colorDimension: "sample",
    calculationLog: [],
    calculationOutputs: [],
  };
  await page.locator("#openBackupRestoreButton").click();
  await page.locator("#restoreJsonInput").setInputFiles({
    name: "legacy-project.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(legacyProject)),
  });
  await page.waitForFunction(() => document.querySelector("#restorePreview")?.textContent?.includes("Legacy project"));
  if (!(await page.locator("#restorePreview").innerText()).includes("Legacy project")) throw new Error("Backup restore preview did not expose the incoming workspace.");
  await page.locator("#confirmRestoreButton").click();
  if (await page.locator(".well").count() !== 6) throw new Error("Legacy JSON import did not restore the six-well plate.");
  const legacyA1Title = await page.locator('[data-well="A1"]').getAttribute("title");
  if (!legacyA1Title?.includes("Legacy-A")) throw new Error(`Legacy JSON import lost A1 data: ${legacyA1Title}`);
  const legacyLiquidPlans = await page.evaluate(() => {
    const workspace = JSON.parse(localStorage.getItem("plate-layout-studio:workspace:v2"));
    return workspace.plates.find((plate) => plate.id === workspace.activePlateId)?.liquidPlans;
  });
  if (!Array.isArray(legacyLiquidPlans) || legacyLiquidPlans.length !== 0) throw new Error("Legacy JSON import did not normalize missing liquid plans.");

  await page.locator("#duplicatePlateButton").click();
  if (await page.locator(".plate-tab").count() !== 2) throw new Error("Full plate duplication did not create a second physical plate.");
  if (!(await page.locator('[data-well="A1"]').getAttribute("title"))?.includes("Legacy-A")) throw new Error("Full plate duplication did not copy well assignments.");
  await page.locator("#projectName").fill("Legacy copy");
  await page.locator("#projectName").press("Enter");
  if ((await page.locator(".plate-tab.active span").innerText()).trim() !== "Legacy copy") throw new Error("Pressing Enter did not immediately synchronize the active plate tab name.");
  await page.locator('[data-well="A1"]').click();
  const multiPlateSampleRow = page.locator(".parameter-input-row").filter({ hasText: "样本" });
  await multiPlateSampleRow.locator(".parameter-value").fill("Copy-A");
  await page.locator("#applyParametersButton").click();
  await page.locator(".plate-tab").first().click();
  const originalPlateTitle = await page.locator('[data-well="A1"]').getAttribute("title");
  if (!originalPlateTitle?.includes("Legacy-A") || originalPlateTitle.includes("Copy-A")) throw new Error(`Same-format plates contaminated each other: ${originalPlateTitle}`);

  await page.locator(".plate-tab").nth(1).click();
  for (const [wellId, value] of [["A2", "Z-A2"], ["B1", "Z-B1"]]) {
    await page.locator(`[data-well="${wellId}"]`).click();
    await page.locator(".parameter-input-row").filter({ hasText: "样本" }).locator(".parameter-value").fill(value);
    await page.locator("#applyParametersButton").click();
  }
  if ((await page.locator("#xlsxOrderSelect").inputValue()) !== "N") throw new Error("XLSX execution order did not default to N.");
  await page.locator("#xlsxOrderSelect").selectOption("Z");

  await page.locator("#projectLiquidScope").selectOption("checked");
  const checkedPlateControl = page.locator("#projectLiquidPlatePicker input").first();
  const checkedPlateMetrics = await checkedPlateControl.evaluate((input) => {
    const style = getComputedStyle(input);
    const box = input.getBoundingClientRect();
    return { width: box.width, height: box.height, appearance: style.appearance };
  });
  if (checkedPlateMetrics.width > 18 || checkedPlateMetrics.height > 18 || checkedPlateMetrics.appearance !== "none") {
    throw new Error(`Checked-plate control is not compact and browser-independent: ${JSON.stringify(checkedPlateMetrics)}`);
  }
  const wasChecked = await checkedPlateControl.isChecked();
  await page.locator("#projectLiquidPlatePicker label").first().click();
  if ((await checkedPlateControl.isChecked()) === wasChecked) throw new Error("Clicking the checked-plate chip did not toggle its compact checkbox.");
  await page.locator("#projectLiquidPlatePicker label").first().click();
  await page.locator("#projectLiquidPlatePicker").screenshot({ path: resolve(outputDirectory, "07a-checked-plate-picker.png") });
  await page.locator("#projectLiquidScope").focus();
  for (let tab = 0; tab < 4; tab += 1) {
    await page.keyboard.press("Tab");
    if (await checkedPlateControl.evaluate((input) => document.activeElement === input)) break;
  }
  if (!(await checkedPlateControl.evaluate((input) => document.activeElement === input))) throw new Error("Checked-plate control is not keyboard reachable.");
  const checkedPlateFocus = await checkedPlateControl.evaluate((input) => getComputedStyle(input).boxShadow);
  if (!checkedPlateFocus || checkedPlateFocus === "none") throw new Error("Checked-plate control has no visible keyboard focus state.");
  await page.locator('.language-option[data-language="en"]').click();
  if ((await page.locator("#projectLiquidScope option").nth(1).innerText()) !== "Checked plates") throw new Error("Checked-plate scope was not translated to English.");
  await page.setViewportSize({ width: 430, height: 900 });
  const compactPicker = await page.locator("#projectLiquidPlatePicker").evaluate((element) => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }));
  if (compactPicker.scrollWidth > compactPicker.clientWidth + 1) throw new Error(`Checked-plate picker overflowed a narrow sidebar: ${JSON.stringify(compactPicker)}`);
  await page.setViewportSize({ width: 1500, height: 1100 });
  await page.locator('.language-option[data-language="zh"]').click();

  for (const plateIndex of [0, 1]) {
    await page.locator(".plate-tab").nth(plateIndex).click();
    await page.locator('.liquid-module-launch[data-liquid-module="basic"]').click();
    await page.locator('#liquidActiveForm [name="calculationType"]').selectOption("dilution");
    await page.locator('#liquidActiveForm button[type="submit"]').click();
    await page.locator('[data-liquid-action="save"]').click();
    await page.locator("#closeLiquidDrawerButton").click();
  }
  await page.locator("#projectLiquidScope").selectOption("all");
  await page.locator("#projectLiquidOverage").fill("10");
  await page.locator("#projectLiquidContainerCapacity").fill("25");
  const sideWidthBeforeSummary = await page.locator(".side-stack").evaluate((element) => element.getBoundingClientRect().width);
  await page.locator("#projectLiquidSummaryButton").click();
  const liquidSummaryText = await page.locator("#projectLiquidSummary").innerText();
  if (!liquidSummaryText.includes("已汇总 2 块板")) throw new Error(`Cross-plate liquid summary did not include both saved plans: ${liquidSummaryText}`);
  if (await page.locator("#projectLiquidSummary .liquid-table").count()) throw new Error("The narrow sidebar still renders the full summary table.");
  await page.locator("[data-open-liquid-summary]").click();
  const fullSummaryText = await page.locator("#summaryDrawerContent").innerText();
  if (!fullSummaryText.includes("Legacy project") || !fullSummaryText.includes("Legacy copy")) throw new Error(`The full summary lost source-plate provenance: ${fullSummaryText}`);
  const preparationNotes = await page.locator("#summaryDrawerContent .operator-preparation-table tbody tr td:last-child").allInnerTexts();
  if (!preparationNotes.some((value) => value.includes("分装"))) throw new Error(`Container-capacity splitting was not exposed in the project summary: ${preparationNotes.join(", ")}`);
  const sideWidthAfterSummary = await page.locator(".side-stack").evaluate((element) => element.getBoundingClientRect().width);
  if (Math.abs(sideWidthAfterSummary - sideWidthBeforeSummary) > 1) throw new Error(`The execution summary changed the sidebar width: ${sideWidthBeforeSummary}px -> ${sideWidthAfterSummary}px`);
  const summaryScroll = await page.locator("#summaryDrawerContent .project-liquid-table-wrap").evaluateAll((elements) => elements.map((element) => ({ client: element.clientWidth, scroll: element.scrollWidth })));
  if (!summaryScroll.length || summaryScroll.some((item) => item.scroll <= item.client)) throw new Error(`Full summary does not expose internal horizontal scroll regions: ${JSON.stringify(summaryScroll)}`);
  if (await page.locator('#summaryDrawerActions [data-project-liquid-export="copy"], #summaryDrawerActions [data-project-liquid-export="csv"], #summaryDrawerActions [data-project-liquid-export="xlsx"]').count() !== 3) {
    throw new Error("Cross-plate summary does not expose copy, CSV, and XLSX actions together.");
  }
  const summaryCsvDownloadPromise = page.waitForEvent("download");
  await page.locator('[data-project-liquid-export="csv"]').click();
  const summaryCsvDownload = await summaryCsvDownloadPromise;
  if (!summaryCsvDownload.suggestedFilename().endsWith("_liquid-summary.csv")) throw new Error(`Unexpected summary CSV filename: ${summaryCsvDownload.suggestedFilename()}`);
  const summaryXlsxDownloadPromise = page.waitForEvent("download");
  await page.locator('[data-project-liquid-export="xlsx"]').click();
  const summaryXlsxDownload = await summaryXlsxDownloadPromise;
  const summaryWorkbook = await XlsxCore.parseWorkbook(await readFile(await summaryXlsxDownload.path()));
  for (const expectedSheet of ["跨板公共液", "独立处理液", "逐步执行清单"]) {
    if (!summaryWorkbook.sheets.some((sheet) => sheet.name === expectedSheet)) throw new Error(`Summary workbook is missing ${expectedSheet}.`);
  }
  await page.screenshot({ path: resolve(outputDirectory, "07-cross-plate-liquid-summary.png"), fullPage: true });
  await page.locator("#closeSummaryDrawerButton").click();

  const treatmentFixtures = [
    [["A1", "Mock"], ["A2", "NC-FAM"], ["B1", "siFBN2-1"]],
    [["A1", "siFBN2-2"], ["A2", "siFBN2-3"], ["B1", "siFBN2-4"]],
  ];
  for (const [plateIndex, assignments] of treatmentFixtures.entries()) {
    await page.locator(".plate-tab").nth(plateIndex).click();
    await page.locator("#newDimensionName").fill("处理");
    await page.locator("#newDimensionName").press("Enter");
    const treatmentInput = page.locator(".parameter-input-row").filter({ hasText: "处理" });
    for (const [wellId, value] of assignments) {
      await page.locator(`[data-well="${wellId}"]`).click();
      await treatmentInput.locator(".parameter-value").fill(value);
      await page.locator("#applyParametersButton").click();
    }
    await page.locator('[data-well="A1"]').click();
    await page.locator('[data-well="A2"]').click({ modifiers: ["Control"] });
    await page.locator('[data-well="B1"]').click({ modifiers: ["Control"] });
    await page.locator('.liquid-module-launch[data-liquid-module="transfection"]').click();
    await page.locator('#liquidActiveForm [name="groupDimension"]').selectOption({ label: "处理" });
    await page.locator('#liquidActiveForm [name="mergeCommonMix"]').selectOption("on");
    if (plateIndex === 0) await page.locator('#liquidActiveForm [name="groupRoleLines"]').fill("Mock=Mock");
    await page.locator('#liquidActiveForm button[type="submit"]').click();
    const singlePlatePhases = await page.locator("#liquidResultHost .operator-execution-table tbody tr td:nth-child(2)").allInnerTexts();
    const expectedSinglePlatePhases = [
      ...Array(3).fill("准备独立处理液"),
      "准备公共液",
      ...Array(3).fill("混合与孵育"),
      "加入培养基",
      ...Array(3).fill("加入复合物"),
    ];
    if (singlePlatePhases.join("|") !== expectedSinglePlatePhases.join("|")) {
      throw new Error(`Single-plate transfection order diverged from the canonical plan: ${singlePlatePhases.join(" | ")}`);
    }
    if (plateIndex === 0) {
      const singleTreatmentOrder = await page.locator("#liquidResultHost .operator-preparation-table tbody tr td:nth-child(2)").allInnerTexts();
      const singleUniqueOrder = singleTreatmentOrder.filter((value, index) => index === 0 || value !== singleTreatmentOrder[index - 1]);
      if (singleUniqueOrder.slice(0, 4).join("|") !== ["Mock · A", "NC-FAM · A", "siFBN2-1 · A", "RNAiMAX + siRNA · B"].join("|")) {
        throw new Error(`Single-plate treatment order is incorrect: ${singleUniqueOrder.join(" | ")}`);
      }
      await page.locator('[data-liquid-action="copy"]').click();
      const copiedSinglePlan = await page.evaluate(() => navigator.clipboard.readText());
      assertTextOrder(copiedSinglePlan, ["Mock · A", "NC-FAM · A", "siFBN2-1 · A", "准备公共液"], "Single-plate clipboard export");
      const singleCsvPromise = page.waitForEvent("download");
      await page.locator('[data-liquid-action="csv"]').click();
      const singleCsv = await readFile(await (await singleCsvPromise).path(), "utf8");
      assertTextOrder(singleCsv, ["Mock · A", "NC-FAM · A", "siFBN2-1 · A", "准备公共液"], "Single-plate CSV export");
      await page.evaluate(() => { window.__issue24PrintCalled = false; window.print = () => { window.__issue24PrintCalled = true; }; });
      await page.locator('[data-liquid-action="print"]').click();
      if (!(await page.evaluate(() => window.__issue24PrintCalled))) throw new Error("Single-plate Print / PDF did not use the canonical result DOM.");
    }
    await page.locator('[data-liquid-action="save"]').click();
    await page.locator("#closeLiquidDrawerButton").click();
    if (plateIndex === 0) {
      const savedExecution = await page.evaluate(() => {
        const savedWorkspace = JSON.parse(localStorage.getItem("plate-layout-studio:workspace:v2"));
        const active = savedWorkspace.plates.find((plate) => plate.id === savedWorkspace.activePlateId);
        const plan = active.liquidPlans.find((item) => item.module === "transfection");
        return { version: plan?.executionPlanVersion, phases: plan?.executionPlanSnapshot?.steps?.map((step) => step.phase) || [] };
      });
      const expectedSavedPhases = [...Array(3).fill("prepare-cargo"), "prepare-common", ...Array(3).fill("combine-incubate"), "add-medium", ...Array(3).fill("add-complex")];
      if (savedExecution.version !== 2 || savedExecution.phases.join("|") !== expectedSavedPhases.join("|")) throw new Error(`Saved plan did not preserve the canonical execution snapshot: ${JSON.stringify(savedExecution)}`);
      await page.locator('[data-saved-liquid-plan]').filter({ hasText: "RNAiMAX + siRNA" }).locator('[data-liquid-plan-action="edit"]').click();
      await page.locator('#liquidActiveForm button[type="submit"]').click();
      const reopenedPhases = await page.locator("#liquidResultHost .operator-execution-table tbody tr td:nth-child(2)").allInnerTexts();
      if (reopenedPhases.join("|") !== expectedSinglePlatePhases.join("|")) throw new Error(`Editing a saved plan changed its execution order: ${reopenedPhases.join(" | ")}`);
      await page.locator("#closeLiquidDrawerButton").click();
    }
  }
  await page.evaluate(async () => {
    const key = "plate-layout-studio:workspace:v2";
    const savedWorkspace = JSON.parse(localStorage.getItem(key));
    const sourcePlan = savedWorkspace.plates[0].liquidPlans.find((plan) => plan.module === "transfection");
    savedWorkspace.plates[0].liquidPlans.push({ ...sourcePlan, id: "legacy-execution-plan-v1", name: "Legacy transfection v1", executionPlanVersion: 1, executionPlanSnapshot: undefined, updatedAt: "2020-01-01T00:00:00.000Z" });
    savedWorkspace.updatedAt = new Date(Date.now() + 1000).toISOString();
    localStorage.setItem(key, JSON.stringify(savedWorkspace));
    await new Promise((resolve, reject) => {
      const request = indexedDB.open("plate-layout-studio", 1);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction("workspaces", "readwrite");
        transaction.objectStore("workspaces").put(savedWorkspace, "active");
        transaction.oncomplete = () => { db.close(); resolve(); };
        transaction.onerror = () => reject(transaction.error);
      };
      request.onerror = () => reject(request.error);
    });
  });
  await page.reload({ waitUntil: "networkidle" });
  const migratedPlanState = await page.evaluate(() => {
    const savedWorkspace = JSON.parse(localStorage.getItem("plate-layout-studio:workspace:v2"));
    return {
      current: savedWorkspace.plates[0].liquidPlans.map((plan) => plan.id),
      archived: (savedWorkspace.plates[0].archivedLiquidPlans || []).map((plan) => plan.id),
    };
  });
  if (migratedPlanState.current.length !== 1 || !migratedPlanState.archived.includes("legacy-execution-plan-v1")) {
    throw new Error(`Legacy duplicate plans were not migrated to one current plan plus inert archive: ${JSON.stringify(migratedPlanState)}`);
  }
  await page.locator("#xlsxOrderSelect").selectOption("Z");
  await page.locator("#projectLiquidScope").selectOption("all");
  await page.locator("#projectLiquidSummaryButton").click();
  if ((await page.locator("#projectLiquidSummary").innerText()).includes("旧方案")) throw new Error("An archived legacy duplicate still entered the current summary.");
  await page.locator("[data-open-liquid-summary]").click();
  const transfectionSummaryText = await page.locator("#summaryDrawerContent").innerText();
  if (transfectionSummaryText.includes("transfection:{") || transfectionSummaryText.includes('"cargoLines"')) throw new Error(`Internal recipe keys leaked into the operator summary: ${transfectionSummaryText.slice(0, 500)}`);
  const preparationLabels = await page.locator("#summaryDrawerContent .operator-preparation-table tbody tr td:nth-child(2)").allInnerTexts();
  const uniquePreparationLabels = preparationLabels.filter((value, index) => index === 0 || value !== preparationLabels[index - 1]);
  const expectedTreatmentOrder = ["Mock · A", "NC-FAM · A", "siFBN2-1 · A", "siFBN2-2 · A", "siFBN2-3 · A", "siFBN2-4 · A", "RNAiMAX + siRNA · B"];
  if (uniquePreparationLabels.slice(0, expectedTreatmentOrder.length).join("|") !== expectedTreatmentOrder.join("|")) {
    throw new Error(`Treatment preparations did not preserve first appearance before the shared mix: ${uniquePreparationLabels.join(" | ")}`);
  }
  const executionPhases = await page.locator("#summaryDrawerContent .operator-execution-table tbody tr td:nth-child(2)").allInnerTexts();
  const expectedPhasePrefix = [
    ...Array(6).fill("准备独立处理液"),
    "准备公共液",
    ...Array(6).fill("混合与孵育"),
    "加入培养基",
    ...Array(6).fill("加入复合物"),
  ];
  if (executionPhases.slice(0, expectedPhasePrefix.length).join("|") !== expectedPhasePrefix.join("|")) {
    throw new Error(`Transfection execution dependencies were incorrect: ${executionPhases.join(" | ")}`);
  }
  await page.locator('#summaryDrawerActions [data-project-liquid-export="copy"]').click();
  const copiedOperatorSummary = await page.evaluate(() => navigator.clipboard.readText());
  if (copiedOperatorSummary.includes("transfection:{")) throw new Error(`Cross-plate clipboard export leaked an internal recipe key: ${copiedOperatorSummary.slice(0, 900)}`);
  assertTextOrder(copiedOperatorSummary, ["Mock · A", "NC-FAM · A", "siFBN2-1 · A", "siFBN2-4 · A", "准备公共液"], "Cross-plate clipboard export");
  const operatorCsvPromise = page.waitForEvent("download");
  await page.locator('[data-project-liquid-export="csv"]').click();
  const operatorCsvDownload = await operatorCsvPromise;
  const operatorCsv = await readFile(await operatorCsvDownload.path(), "utf8");
  if (operatorCsv.includes("transfection:{") || operatorCsv.includes('"cargoLines"')) throw new Error("Internal recipe keys leaked into the operator CSV.");
  const operatorXlsxPromise = page.waitForEvent("download");
  await page.locator('[data-project-liquid-export="xlsx"]').click();
  const operatorXlsxDownload = await operatorXlsxPromise;
  const operatorWorkbook = await XlsxCore.parseWorkbook(await readFile(await operatorXlsxDownload.path()));
  const treatmentSheet = operatorWorkbook.sheets.find((sheet) => sheet.name === "独立处理液");
  const exportedTreatmentLabels = (treatmentSheet?.rows || []).slice(1).map((row) => String(row[1] || "")).filter((value, index, values) => value && (index === 0 || value !== values[index - 1]));
  if (exportedTreatmentLabels.slice(0, 6).join("|") !== expectedTreatmentOrder.slice(0, 6).join("|")) throw new Error(`Operator XLSX treatment order was incorrect: ${exportedTreatmentLabels.join(" | ")}`);
  const executionSheet = operatorWorkbook.sheets.find((sheet) => sheet.name === "逐步执行清单");
  const exportedPhases = (executionSheet?.rows || []).slice(1).map((row) => String(row[1] || ""));
  if (exportedPhases.slice(0, expectedPhasePrefix.length).join("|") !== expectedPhasePrefix.join("|")) throw new Error(`Operator XLSX execution order was incorrect: ${exportedPhases.join(" | ")}`);
  if (JSON.stringify(operatorWorkbook).includes("transfection:{")) throw new Error("Internal recipe keys leaked into the operator XLSX.");
  await page.screenshot({ path: resolve(outputDirectory, "07b-transfection-operator-plan.png"), fullPage: true });
  await page.locator("#closeSummaryDrawerButton").click();

  await page.locator("#overviewToggleButton").click();
  if (await page.locator(".overview-plate").count() !== 2) throw new Error("Project overview did not show both physical plates.");
  await page.screenshot({ path: resolve(outputDirectory, "07-multi-plate-overview.png"), fullPage: true });
  await page.locator("#overviewToggleButton").click();

  const xlsxDownloadPromise = page.waitForEvent("download");
  await page.locator("#exportXlsxButton").click();
  const xlsxDownload = await xlsxDownloadPromise;
  if (!xlsxDownload.suggestedFilename().endsWith("_multi-plate.xlsx")) throw new Error(`Unexpected XLSX filename: ${xlsxDownload.suggestedFilename()}`);
  const xlsxPath = await xlsxDownload.path();
  const xlsxBytes = await readFile(xlsxPath);
  if (xlsxBytes[0] !== 0x50 || xlsxBytes[1] !== 0x4b) throw new Error("Multi-plate export is not a real XLSX ZIP workbook.");
  const parsedWorkbook = await XlsxCore.parseWorkbook(xlsxBytes);
  const exportedSheetNames = parsedWorkbook.sheets.map((sheet) => sheet.name);
  for (const expectedSheet of ["实验总览", "Legacy project-配液", "Legacy copy-配液", "Legacy project-执行", "Legacy copy-执行", "跨板公共液", "独立处理液", "逐步执行清单"]) {
    if (!parsedWorkbook.sheets.some((sheet) => sheet.name === expectedSheet)) throw new Error(`Execution workbook is missing ${expectedSheet}; exported: ${exportedSheetNames.join(" | ")}.`);
  }
  const overviewSheet = parsedWorkbook.sheets.find((sheet) => sheet.name === "实验总览");
  const overviewPlanNames = (overviewSheet?.rows || []).slice(1).map((row) => String(row[5] || "").trim());
  if (overviewPlanNames.length !== 2 || overviewPlanNames.some((name) => !name)) throw new Error(`Experiment overview did not preserve the saved liquid-plan names: ${overviewPlanNames.join(" | ")}`);
  const plateLiquidSheet = parsedWorkbook.sheets.find((sheet) => sheet.name === "Legacy copy-配液");
  for (const requiredHeader of ["方案名称", "配方", "配液类型", "每孔", "基础需求", "本板方案准备量", "目标孔", "操作步骤"]) {
    if (!(plateLiquidSheet?.rows?.[0] || []).includes(requiredHeader)) throw new Error(`Per-plate liquid sheet is missing ${requiredHeader}.`);
  }
  const plateExecutionSheet = parsedWorkbook.sheets.find((sheet) => sheet.name === "Legacy project-执行");
  const plateExecutionHeaderIndex = (plateExecutionSheet?.rows || []).findIndex((row) => row[0] === "执行顺序");
  const plateExecutionPhases = (plateExecutionSheet?.rows || []).slice(plateExecutionHeaderIndex + 1).map((row) => String(row[1] || "")).filter(Boolean);
  const expectedPerPlatePhasePrefix = [...Array(3).fill("准备独立处理液"), "准备公共液", ...Array(3).fill("混合与孵育"), "加入培养基", ...Array(3).fill("加入复合物")];
  if (plateExecutionHeaderIndex < 0 || plateExecutionPhases.slice(0, expectedPerPlatePhasePrefix.length).join("|") !== expectedPerPlatePhasePrefix.join("|")) {
    throw new Error(`Project XLSX per-plate execution sheet diverged from the saved canonical plan: ${plateExecutionPhases.join(" | ")}`);
  }
  const copyPlateSheet = parsedWorkbook.sheets.find((sheet) => sheet.name === "Legacy copy");
  const copyWellOrder = (copyPlateSheet?.rows || []).slice(1).map((row) => row[0]).filter((wellId) => /^[A-Z]+\d+$/.test(String(wellId)));
  if (copyWellOrder.slice(0, 3).join(",") !== "A1,A2,A3") throw new Error(`Z-order XLSX plate sheet was incorrect: ${copyWellOrder.join(",")}`);
  await page.locator("#openProjectImportButton").click();
  await page.locator("#importJsonInput").setInputFiles({ name: "roundtrip.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: xlsxBytes });
  await page.waitForFunction(() => !document.querySelector("#confirmImportButton")?.hidden);
  await page.locator("#confirmImportButton").click();
  if (await page.locator(".plate-tab").count() !== 4) throw new Error("XLSX round-trip did not add exactly the two plate worksheets or failed to skip system sheets.");
  await page.reload({ waitUntil: "networkidle" });
  if (await page.locator(".plate-tab").count() !== 4) throw new Error("IndexedDB/local workspace persistence did not restore all plates after reload.");
  await page.locator("#deletePlateButton").click();
  await page.locator("#deletePlateButton").click();
  if (await page.locator(".plate-tab").count() !== 3) throw new Error("Plate deletion did not remove the active plate.");
  await page.locator("#undoButton").click();
  if (await page.locator(".plate-tab").count() !== 4) throw new Error("Project-level undo did not restore the deleted plate.");

  // Issue #28 exact regression fixture: four chemically identical A549 plates must
  // contribute exactly once per treatment after legacy duplicate normalization.
  await harness.persistWorkspace(issue28Workspace({ legacyDuplicateOnFirstPlate: true }));
  await page.locator("#projectLiquidScope").selectOption("all");
  await page.locator("#projectLiquidSummaryButton").click();
  await page.locator("[data-open-liquid-summary]").click();
  const issue28Labels = await page.locator("#summaryDrawerContent .operator-preparation-table tbody tr td:nth-child(2)").allInnerTexts();
  const issue28UniqueLabels = issue28Labels.filter((value, index) => index === 0 || value !== issue28Labels[index - 1]);
  const issue28ExpectedLabels = ["Mock · A", "NC-FAM · A", "siFBN2-1 · A", "siFBN2-2 · A", "siFBN2-3 · A", "siFBN2-4 · A", "RNAiMAX + siRNA · B"];
  if (issue28UniqueLabels.join("|") !== issue28ExpectedLabels.join("|")) throw new Error(`Issue #28 four-plate fixture produced duplicate or missing preparations: ${issue28UniqueLabels.join(" | ")}`);
  const issue28Targets = await page.locator("#summaryDrawerContent .operator-preparation-table tbody tr td:nth-child(10)").allInnerTexts();
  if (issue28Targets.some((target) => !["A549-1", "A549-2", "A549-3", "A549-4"].every((plate) => target.includes(plate)))) {
    throw new Error(`Issue #28 merged preparations do not all target four plates: ${issue28Targets.join(" | ")}`);
  }
  const issue28CsvPromise = page.waitForEvent("download");
  await page.locator('[data-project-liquid-export="csv"]').click();
  const issue28Csv = await readFile(await (await issue28CsvPromise).path(), "utf8");
  for (const label of issue28ExpectedLabels) if (!issue28Csv.includes(label)) throw new Error(`Issue #28 CSV is missing ${label}.`);
  if (issue28Csv.includes("transfection:{") || issue28Csv.includes('"cargoLines"')) throw new Error("Issue #28 CSV exposed an internal compatibility key.");
  const issue28XlsxPromise = page.waitForEvent("download");
  await page.locator('[data-project-liquid-export="xlsx"]').click();
  const issue28Workbook = await XlsxCore.parseWorkbook(await readFile(await (await issue28XlsxPromise).path()));
  const issue28CargoSheet = issue28Workbook.sheets.find((sheet) => sheet.name === "独立处理液");
  const issue28XlsxLabels = (issue28CargoSheet?.rows || []).slice(1).map((row) => String(row[1] || "")).filter((value, index, values) => value && (index === 0 || value !== values[index - 1]));
  if (issue28XlsxLabels.join("|") !== issue28ExpectedLabels.slice(0, 6).join("|")) throw new Error(`Issue #28 XLSX did not preserve one row group per treatment: ${issue28XlsxLabels.join(" | ")}`);
  await page.screenshot({ path: resolve(outputDirectory, "08-issue-28-four-plate-merge.png"), fullPage: true });
  await page.locator("#closeSummaryDrawerButton").click();
  await harness.persistWorkspace(issue28Workspace({ changedPlate: 4, changedTreatment: "NC-FAM" }));
  await page.locator("#projectLiquidScope").selectOption("all");
  await page.locator("#projectLiquidSummaryButton").click();
  const issue28SplitSummary = await page.locator("#projectLiquidSummary").innerText();
  if (!issue28SplitSummary.includes("每孔组分或体积不同") || issue28SplitSummary.includes("transfection:{")) {
    throw new Error(`A real preparation difference did not produce an operator-facing separation reason: ${issue28SplitSummary}`);
  }
  await page.locator("[data-open-liquid-summary]").click();
  const issue28SplitLabels = await page.locator("#summaryDrawerContent .operator-preparation-table tbody tr td:nth-child(2)").allInnerTexts();
  if (issue28SplitLabels.filter((label) => label === "NC-FAM · A").length < 2) throw new Error("A real NC-FAM volume difference was incorrectly merged.");
  await page.screenshot({ path: resolve(outputDirectory, "09-issue-28-merge-explanation.png"), fullPage: true });
  await page.locator("#closeSummaryDrawerButton").click();

  await page.evaluate(async () => {
    localStorage.clear();
    await new Promise((resolve) => {
      const request = indexedDB.deleteDatabase("plate-layout-studio");
      request.onsuccess = request.onerror = request.onblocked = resolve;
    });
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.locator('.plate-option[data-size="12"]').click();
  await page.locator('.liquid-module-launch[data-liquid-module="transfection"]').click();
  const unsupportedPlateForm = page.locator("#liquidActiveForm");
  for (const name of ["finalVolume", "complexVolume", "reagentPerWell"]) {
    if ((await unsupportedPlateForm.locator(`[name="${name}"]`).inputValue()) !== "") throw new Error(`Unsupported 12-well RNAiMAX format silently received a ${name} default.`);
  }
  if (!(await unsupportedPlateForm.innerText()).includes("不自动线性外推")) throw new Error("Unsupported plate format does not explain that recipe values are not extrapolated.");
  await page.locator("[data-liquid-library-select]").selectOption("builtin-rnai");
  await page.locator('[data-liquid-action="load-preset"]').click();
  for (const name of ["finalVolume", "complexVolume", "reagentPerWell"]) {
    if ((await page.locator(`#liquidActiveForm [name="${name}"]`).inputValue()) !== "") throw new Error(`Loading the built-in RNAiMAX recipe silently injected ${name} into an unsupported 12-well format.`);
  }
  await page.locator("#closeLiquidDrawerButton").click();
  await page.locator('.plate-option[data-size="6"]').click();
  await page.locator('.liquid-module-launch[data-liquid-module="transfection"]').click();
  const sixWellForm = page.locator("#liquidActiveForm");
  await page.locator("[data-liquid-library-select]").selectOption("builtin-rnai");
  await page.locator('[data-liquid-action="load-preset"]').click();
  await sixWellForm.locator('[name="preset"]').selectOption("lipo3000");
  await sixWellForm.locator('[name="preset"]').selectOption("rnai");
  if ((await sixWellForm.locator('[name="finalVolume"]').inputValue()) !== "2000" || (await sixWellForm.locator('[name="complexVolume"]').inputValue()) !== "200" || (await sixWellForm.locator('[name="reagentPerWell"]').inputValue()) !== "6") {
    throw new Error("Switching presets lost the known six-well RNAiMAX starting values.");
  }

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
    liquidPreparation: "RNAiMAX scope changed from 4 to 24 wells while draft inputs persisted; 24-well totals matched 8.64/423.36/25.92/406.08 µL",
    liquidProjectSave: "transfection recipe persisted in the project JSON",
    liquidScopeAcceptance: "read-only selected-well scope, English guidance, mobile drawer, and legacy JSON compatibility passed",
    advancedTransfection: "custom cargo/tube definitions and confirmed working-solution application passed",
    recipeLibrary: "save, copy, delete, JSON export, and JSON import passed",
    serialDilution: "stepwise preparation accumulated downstream transfers backwards and retained each target volume",
    drugDosing: "per-drug generation, dosing concentration, vehicle fraction, control wells, and edge-safe layout passed",
    selectedWellSummary: "shows all assigned values for A1",
    plateSizes: [6, 12, 24, 96, 384],
    autosave: "restored after reload",
    exports: [csvDownload.suggestedFilename(), svgDownload.suggestedFilename()],
    excelTemplate: templateDownload.suggestedFilename(),
    compactHeader: "well actions, color control, and exports align in one row; English plate options stay on one row",
    editablePlateName: "subtle dashed underline and text cursor expose inline editing without another button",
    interactionHelp: "selection instructions sit inside the plate visualization above the wells",
    spreadsheetImport: "Excel-compatible CSV created a 12-well plate with units and quoted values",
    multiPlateWorkspace: "same-format plates stayed isolated; overview, duplication, deletion, project undo, persistence, and XLSX round-trip passed",
    crossPlateLiquid: "two compatible saved plans exposed per-plate contributions, merged before one shared 10% overage, and split by container capacity",
    issue28SinglePlanLifecycle: "first save created one plan; later save replaced it with a stable identity; legacy duplicates migrated to an inert archive",
    issue28FourPlateFixture: "Mock, NC-FAM, six treatment-specific/common preparations merged once across A549-1 through A549-4; CSV and XLSX were read back",
    issue28CompatibilityExplanation: "a deliberate per-well composition difference remained separate with an operator-facing reason and no internal key",
    transfectionExecutionPlan: "single-plate UI/save/reopen/copy/CSV/print, cross-plate UI/copy/CSV/XLSX, and project XLSX consumed one versioned plan; legacy v1 was blocked",
    checkedPlateAccessibility: "compact checkbox remained keyboard reachable, visibly focused, translated, and narrow-sidebar safe",
    xlsxExecutionOrder: "N remained the default; optional Z produced A1, A2, A3 in the exported six-well plate sheet",
    typography: { desktop: typographyScale, mobile: mobileTypography },
    mobilePageWidth: pageWidths,
    languageSwitch: "Chinese and English persisted across reload",
    screenshots: outputDirectory,
  }, null, 2));
} finally {
  await browser.close();
}
}

if (process.argv[1]?.endsWith("comprehensive-regression.mjs")) await runComprehensiveRegression();
