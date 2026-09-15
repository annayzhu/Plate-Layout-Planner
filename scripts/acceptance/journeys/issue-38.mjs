import { issue28Workspace } from "../fixtures.mjs";
import { resolve } from "node:path";

export async function issue38PlateZoomJourney({ page, readWorkspace, persistWorkspace, downloadText, downloadWorkbook, parseCsv, XlsxCore, outputDirectory }) {
  await page.setViewportSize({ width: 1500, height: 1100 });
  const zoomFixture = issue28Workspace();
  zoomFixture.plates[0].plateSize = 24;
  zoomFixture.plates[0].plates[24] = structuredClone(zoomFixture.plates[0].plates[6]);
  await persistWorkspace(zoomFixture);
  await page.locator('[data-well="A1"]').click();
  await page.locator("#projectName").fill("A549-1 history probe");
  await page.locator("#projectName").press("Enter");
  const before = await readWorkspace();
  const activeBefore = before.plates.find((plate) => plate.id === before.activePlateId);
  const planBefore = structuredClone(activeBefore.liquidPlans[0]);
  const undoDisabledBefore = await page.locator("#undoButton").isDisabled();
  const exportBefore = await downloadText(() => page.locator("#exportCsvButton").click());
  if ((await page.locator("#plateZoomIndicator").innerText()).trim() !== "100%") throw new Error("Plate zoom did not start at 100%.");
  const pageScrollBefore = await page.evaluate(() => window.scrollY);
  await page.locator(".hero").hover();
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(120);
  const pageScrollAfter = await page.evaluate(() => window.scrollY);
  if (pageScrollAfter <= pageScrollBefore) throw new Error("Wheel scrolling outside the plate canvas no longer scrolls the page.");
  const initialWidth = await page.locator('[data-well="A1"]').evaluate((well) => well.getBoundingClientRect().width);

  await page.locator("#plateCanvas").hover();
  await page.mouse.wheel(0, -240);
  await page.waitForTimeout(180);

  const zoomedWidth = await page.locator('[data-well="A1"]').evaluate((well) => well.getBoundingClientRect().width);
  const indicator = await page.locator("#plateZoomIndicator").innerText();
  if (zoomedWidth <= initialWidth) throw new Error(`Mouse-wheel zoom did not enlarge wells: ${initialWidth} -> ${zoomedWidth}`);
  if (!/^1[01]\d%$/.test(indicator)) throw new Error(`Zoom indicator did not report the enlarged view: ${indicator}`);
  await page.mouse.wheel(0, 120);
  const zoomedOutWidth = await page.locator('[data-well="A1"]').evaluate((well) => well.getBoundingClientRect().width);
  if (zoomedOutWidth >= zoomedWidth) throw new Error(`Mouse-wheel zoom did not shrink wells: ${zoomedWidth} -> ${zoomedOutWidth}`);
  await page.mouse.wheel(0, -120);

  if ((await page.locator("#selectionCount").innerText()) !== "已选 1 孔" || !(await page.locator('[data-well="A1"]').getAttribute("class")).includes("selected")) {
    throw new Error("Zoom changed the existing well selection.");
  }
  if ((await page.locator("#undoButton").isDisabled()) !== undoDisabledBefore) throw new Error("Zoom changed the undo-history state.");
  const afterZoom = await readWorkspace();
  const activeAfterZoom = afterZoom.plates.find((plate) => plate.id === afterZoom.activePlateId);
  if (JSON.stringify(activeAfterZoom.liquidPlans[0]) !== JSON.stringify(planBefore) || activeAfterZoom.liquidPlans[0].stale) {
    throw new Error("Zoom changed or invalidated the saved liquid plan.");
  }
  if (JSON.stringify(afterZoom) !== JSON.stringify(before)) throw new Error("Presentation-only zoom changed persisted scientific workspace data.");
  const exportAfter = await downloadText(() => page.locator("#exportCsvButton").click());
  if (!exportBefore.bytes.equals(exportAfter.bytes)) throw new Error("Zoom changed the current-plate CSV export.");
  await page.locator("#projectName").fill("A549-1 post-zoom edit");
  await page.locator("#projectName").press("Enter");
  await page.locator("#undoButton").click();
  const afterUndo = await readWorkspace();
  const activeAfterUndo = afterUndo.plates.find((plate) => plate.id === afterUndo.activePlateId);
  if (activeAfterUndo.name !== activeBefore.name || JSON.stringify(activeAfterUndo.liquidPlans[0]) !== JSON.stringify(planBefore)) {
    throw new Error("Undo after zoom did not revert only the post-zoom edit.");
  }
  if (await page.locator("#undoButton").isDisabled()) throw new Error("Undo after zoom lost the history entry that existed before zooming.");

  await page.locator('[data-well="A1"]').click();
  if ((await page.locator("#selectionCount").innerText()) !== "已选 1 孔") throw new Error("A well could not be selected after zooming.");
  await page.locator('[data-well="B2"]').click({ modifiers: [process.platform === "darwin" ? "Meta" : "Control"] });
  if ((await page.locator("#selectionCount").innerText()) !== "已选 2 孔") throw new Error("Ctrl/Command-click did not add a well after zooming.");
  await page.locator("#plateCanvas").click({ position: { x: 12, y: 12 } });
  if ((await page.locator("#selectionCount").innerText()) !== "已选 0 孔") throw new Error("Empty-space click did not clear selection after zooming.");
  await page.locator('[data-well="A1"]').click();
  await page.locator('[data-well="A3"]').click({ modifiers: ["Shift"] });
  if ((await page.locator("#selectionCount").innerText()) !== "已选 3 孔") throw new Error("Shift range selection changed after zooming.");
  const a1 = await page.locator('[data-well="A1"]').boundingBox();
  const b2 = await page.locator('[data-well="B2"]').boundingBox();
  if (!a1 || !b2) throw new Error("Zoomed well positions were unavailable for box selection.");
  await page.mouse.move(a1.x + a1.width / 2, a1.y + a1.height / 2);
  await page.mouse.down();
  await page.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2, { steps: 8 });
  await page.mouse.up();
  if ((await page.locator("#selectionCount").innerText()) !== "已选 4 孔") throw new Error("Box selection changed after zooming.");

  await page.locator('[data-size="96"]').click();
  const mediumInitial = await page.locator('[data-well="A1"]').evaluate((well) => well.getBoundingClientRect().width);
  await page.locator("#plateCanvas").hover();
  await page.mouse.wheel(0, -240);
  const mediumZoomed = await page.locator('[data-well="A1"]').evaluate((well) => well.getBoundingClientRect().width);
  if (mediumZoomed <= mediumInitial) throw new Error(`96-well zoom did not enlarge the plate: ${mediumInitial} -> ${mediumZoomed}`);

  await page.locator('[data-size="384"]').click();
  const denseInitial = await page.locator('[data-well="A1"]').evaluate((well) => well.getBoundingClientRect().width);
  await page.locator("#plateCanvas").hover();
  await page.mouse.wheel(0, 10000);
  if ((await page.locator("#plateZoomIndicator").innerText()).trim() !== "60%") throw new Error("Plate zoom did not respect the 60% lower bound.");
  await page.mouse.wheel(0, -10000);
  if ((await page.locator("#plateZoomIndicator").innerText()).trim() !== "180%") throw new Error("Plate zoom did not respect the 180% upper bound.");
  await page.waitForTimeout(180);
  const denseZoomed = await page.locator('[data-well="A1"]').evaluate((well) => well.getBoundingClientRect().width);
  if (denseZoomed <= denseInitial * 1.25) throw new Error(`384-well zoom did not materially enlarge the plate: ${denseInitial} -> ${denseZoomed}`);
  const scrollViewport = await page.locator(".plate-scroll").evaluate((element) => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth, clientHeight: element.clientHeight, scrollHeight: element.scrollHeight }));
  if (scrollViewport.scrollWidth <= scrollViewport.clientWidth || scrollViewport.scrollHeight <= scrollViewport.clientHeight) throw new Error(`Zoomed 384-well plate is not reachable through both scroll axes: ${JSON.stringify(scrollViewport)}`);
  await page.locator(".plate-scroll").evaluate((element) => element.scrollTo(0, 0));
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: resolve(outputDirectory, "issue-38-384-well-zoom.png"), fullPage: true });

  const nearlyFull = issue28Workspace();
  nearlyFull.plates = Array.from({ length: 23 }, (_, index) => ({
    ...structuredClone(nearlyFull.plates[0]),
    id: `capacity-${index + 1}`,
    name: `Capacity ${index + 1}`,
    liquidPlans: [],
  }));
  nearlyFull.activePlateId = nearlyFull.plates[0].id;
  await persistWorkspace(nearlyFull);
  const beforeOverflow = await readWorkspace();
  const importBytes = XlsxCore.buildWorkbook({ sheets: [
    { name: "Incoming A", rows: [["孔位", "样本"], ["A1", "A"]] },
    { name: "Incoming B", rows: [["孔位", "样本"], ["A1", "B"]] },
  ] });
  await page.locator("#openProjectImportButton").click();
  await page.locator("#importJsonInput").setInputFiles({ name: "two-plates.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from(importBytes) });
  await page.waitForFunction(() => document.querySelector("#importPreview")?.textContent?.includes("最多还可放入 1 块"));
  if (!(await page.locator("#confirmImportButton").isDisabled())) throw new Error("Overflowing import was still confirmable.");
  if (JSON.stringify(await readWorkspace()) !== JSON.stringify(beforeOverflow)) throw new Error("Overflowing import partially changed the workspace.");
  await page.locator("#closeProjectFileDialogButton").click();

  const duplicateFixture = issue28Workspace();
  duplicateFixture.plates = [structuredClone(duplicateFixture.plates[0])];
  duplicateFixture.plates[0].name = "Incoming A";
  duplicateFixture.plates[0].liquidPlans = [];
  duplicateFixture.activePlateId = duplicateFixture.plates[0].id;
  await persistWorkspace(duplicateFixture);
  await page.locator("#openProjectImportButton").click();
  await page.locator("#importJsonInput").setInputFiles({ name: "two-plates.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from(importBytes) });
  await page.waitForFunction(() => document.querySelector("#importPreview")?.textContent?.includes("Incoming A 2"));
  const duplicatePreview = await page.locator("#importPreview").innerText();
  if (!duplicatePreview.includes("Incoming A → Incoming A 2")) throw new Error(`Import preview did not disclose its duplicate-name resolution: ${duplicatePreview}`);
  await page.locator("#confirmImportButton").click();
  const importedNames = await page.locator(".plate-tab span").allInnerTexts();
  if (importedNames.join("|") !== "Incoming A|Incoming A 2|Incoming B") throw new Error(`Confirmed import diverged from the prepared preview: ${importedNames.join("|")}`);

  const summaryFixture = issue28Workspace();
  summaryFixture.plates[0].dimensions.push({ id: "sample", name: "样本", type: "text", unit: "" });
  summaryFixture.plates[0].plates[6].A1.params.sample = "A549";
  await persistWorkspace(summaryFixture);
  await page.locator("#projectLiquidScope").selectOption("all");
  await page.locator("#projectLiquidSummaryButton").click();

  await page.locator("#colorDimension").selectOption("sample");
  let currentWorkspace = await readWorkspace();
  if (currentWorkspace.plates[0].liquidPlans[0]?.stale) throw new Error("Changing only the color parameter made a saved liquid plan stale.");

  await page.locator("#projectName").fill("A549-1 renamed");
  await page.locator("#projectName").press("Enter");
  await page.locator("#movePlateRightButton").click();
  await page.locator("[data-open-liquid-summary]").click();
  const summaryText = await page.locator("#summaryDrawerContent").innerText();
  if (!summaryText.includes("A549-1 renamed") || summaryText.includes("A549-1:")) throw new Error("Rendered summary retained a stale plate name after rename/reorder.");
  const summaryWorkbook = await downloadWorkbook(() => page.locator('[data-project-liquid-export="xlsx"]').click());
  const workbookText = summaryWorkbook.workbook.sheets.flatMap((sheet) => sheet.rows.flat()).join("\n");
  if (!workbookText.includes("A549-1 renamed") || workbookText.includes("A549-1:")) throw new Error("XLSX export retained a stale plate identity.");
  await page.locator("#closeSummaryDrawerButton").click();
  await page.locator("#deletePlateButton").click();
  await page.locator("#deletePlateButton").click();
  await page.locator("[data-open-liquid-summary]").click();
  const postDeleteSummary = await page.locator("#summaryDrawerContent").innerText();
  if (postDeleteSummary.includes("A549-1 renamed") || !postDeleteSummary.includes("A549-2")) throw new Error("Rendered summary did not remove a deleted plate or lost remaining plates.");
  const summaryCsv = await downloadText(() => page.locator('[data-project-liquid-export="csv"]').click());
  const summaryCsvRows = parseCsv(summaryCsv.text);
  const populatedCsvRows = summaryCsvRows.filter((row) => row.some((cell) => cell.trim()));
  if (populatedCsvRows.length < 2 || !populatedCsvRows.some((row) => row.length >= 4)) throw new Error("Summary CSV could not be parsed into a tabular result.");
  const summaryCsvCells = populatedCsvRows.flat();
  if (summaryCsvCells.some((cell) => cell.includes("A549-1 renamed")) || !summaryCsvCells.some((cell) => cell.includes("A549-2"))) throw new Error("Parsed CSV retained a deleted plate identity.");
  await page.locator("#closeSummaryDrawerButton").click();

  await page.locator('[data-well="A1"]').click();
  await page.locator('.parameter-input-row').filter({ hasText: "处理" }).locator(".parameter-value").fill("Changed treatment");
  await page.locator("#applyParametersButton").click();
  currentWorkspace = await readWorkspace();
  const active = currentWorkspace.plates.find((plate) => plate.id === currentWorkspace.activePlateId);
  if (!active.liquidPlans[0]?.stale) throw new Error("Changing scientific well assignments did not mark the saved liquid plan stale.");

  return { initialWidth, zoomedWidth, zoomedOutWidth, mediumInitial, mediumZoomed, denseInitial, denseZoomed, indicator, bounds: "60%-180%", scrollViewport, outsideScroll: true, zoomState: "selection-history-plan-export-preserved", importOverflow: "atomic", duplicateImport: "previewed-and-confirmed", summaryIdentity: "fresh", csvIdentity: "parsed-and-fresh", invalidation: "classified" };
}
