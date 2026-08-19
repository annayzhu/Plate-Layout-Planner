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
  await page.screenshot({ path: resolve(outputDirectory, "01-initial-24-well.png"), fullPage: true });

  await page.locator('[data-well="A1"]').click();
  await page.locator('[data-well="A3"]').click({ modifiers: ["Shift"] });
  if ((await page.locator("#selectionCount").innerText()) !== "已选 3 孔") throw new Error("Shift selection did not select A1-A3.");

  const sampleRow = page.locator(".parameter-input-row").filter({ hasText: "样本" });
  await sampleRow.locator(".parameter-value").fill("Sample-A");
  const valueRow = page.locator(".parameter-input-row").filter({ hasText: "原始值" });
  await valueRow.locator(".parameter-value").fill("2");
  await page.locator("#applyParametersButton").click();

  await page.locator("#calcConditionDimension").selectOption("sample");
  await page.locator("#calcConditionValue").fill("Sample-A");
  await page.locator("#calcSource").selectOption("value");
  await page.locator("#constantOperand").fill("5");
  await page.locator("#calcOutputName").fill("校正值");
  await page.locator("#runCalculationButton").click();
  const resultText = await page.locator("#calculationResult").innerText();
  if (!resultText.includes("3 孔已写入")) throw new Error(`Unexpected calculation result: ${resultText}`);

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

  await page.locator('.plate-option[data-size="6"]').click();
  if (await page.locator(".well").count() !== 6) throw new Error("6-well plate did not render 6 wells.");
  await page.locator('.plate-option[data-size="12"]').click();
  if (await page.locator(".well").count() !== 12) throw new Error("12-well plate did not render 12 wells.");
  await page.locator('.plate-option[data-size="96"]').click();
  if (await page.locator(".well").count() !== 96) throw new Error("96-well plate did not render 96 wells.");
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
    shiftSelection: "3 wells",
    dragSelection: "4 wells",
    calculation: resultText,
    selectedWellSummary: "shows all assigned values for A1",
    plateSizes: [6, 12, 24, 96, 384],
    autosave: "restored after reload",
    exports: [csvDownload.suggestedFilename(), svgDownload.suggestedFilename()],
    mobilePageWidth: pageWidths,
    languageSwitch: "Chinese and English persisted across reload",
    screenshots: outputDirectory,
  }, null, 2));
} finally {
  await browser.close();
}
