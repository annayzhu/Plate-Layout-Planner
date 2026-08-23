import { resolve } from "node:path";

export async function plateLayoutJourney({ page, outputDirectory }) {
  if (await page.locator(".well").count() !== 24) throw new Error("Initial 24-well plate did not render.");
  if (await page.locator("#plateCanvas > .plate-interaction-help").count() !== 1) throw new Error("Selection guidance is not inside the plate canvas.");

  await page.locator("#projectName").fill("Isolated plate journey");
  await page.locator("#projectName").press("Enter");
  if (!(await page.locator(".plate-tab.active").innerText()).includes("Isolated plate journey")) throw new Error("Enter did not update the active plate tab.");

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
