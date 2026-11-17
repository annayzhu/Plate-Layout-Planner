import { resolve } from "node:path";

const modifier = process.platform === "darwin" ? "Meta" : "Control";

async function assign(page, wellIds, sample) {
  await page.locator(`[data-well="${wellIds[0]}"]`).click();
  for (const wellId of wellIds.slice(1)) await page.locator(`[data-well="${wellId}"]`).click({ modifiers: [modifier] });
  await page.locator(".parameter-input-row").filter({ hasText: "样本" }).locator(".parameter-value").fill(sample);
  await page.locator("#applyParametersButton").click();
}

async function sampleAt(page, wellId) {
  return (await page.locator(`[data-well="${wellId}"] .well-primary`).allInnerTexts())[0] || "";
}

async function center(page, wellId) {
  const box = await page.locator(`[data-well="${wellId}"]`).boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function classesOf(page, wellIds) {
  return page.evaluate((ids) => Object.fromEntries(ids.map((id) => [id, [...document.querySelector(`[data-well="${id}"]`).classList].filter((name) => /^(drop|paste)-/.test(name))])), wellIds);
}

async function dragBetween(page, fromWell, toWell, { release = true, screenshot } = {}) {
  const from = await center(page, fromWell);
  const to = await center(page, toWell);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 8, from.y + 8, { steps: 2 });
  await page.mouse.move(to.x, to.y, { steps: 8 });
  if (screenshot) await page.screenshot({ path: screenshot });
  if (release) await page.mouse.up();
}

export async function moveAndPasteJourney({ page, outputDirectory }) {
  await page.locator('.plate-option[data-size="96"]').click();
  await assign(page, ["A1"], "S1");
  await assign(page, ["A2"], "S2");
  await assign(page, ["A3"], "S3");
  await assign(page, ["A4"], "S4");
  await assign(page, ["C1"], "C-one");

  // Select A1–A3, drag one step to the right: an overlapping shift rotates A4 into A1.
  await page.locator('[data-well="A1"]').click();
  await page.locator('[data-well="A3"]').click({ modifiers: ["Shift"] });
  await dragBetween(page, "A2", "A3", { release: false, screenshot: resolve(outputDirectory, "move-preview.png") });
  const preview = await classesOf(page, ["A1", "A2", "A3", "A4"]);
  if (preview.A4.join() !== "drop-landing,drop-swap" && !(preview.A4.includes("drop-landing") && preview.A4.includes("drop-swap"))) throw new Error(`A4 should be marked as landing and swapped: ${JSON.stringify(preview)}`);
  if (!preview.A2.includes("drop-landing") || preview.A1.length) throw new Error(`Drag preview marked the wrong wells: ${JSON.stringify(preview)}`);
  await page.mouse.up();
  const afterRotate = [await sampleAt(page, "A1"), await sampleAt(page, "A2"), await sampleAt(page, "A3"), await sampleAt(page, "A4")];
  if (afterRotate.join("|") !== "S4|S1|S2|S3") throw new Error(`Overlapping move did not rotate: ${afterRotate.join("|")}`);
  if ((await page.locator("#selectionCount").innerText()) !== "已选 3 孔") throw new Error("Moved wells did not stay selected.");

  // Drag the selection (now A2–A4) onto row C: a clean block swap.
  await dragBetween(page, "A2", "C1");
  const afterSwap = [await sampleAt(page, "A2"), await sampleAt(page, "C1"), await sampleAt(page, "C2"), await sampleAt(page, "C3")];
  if (afterSwap.join("|") !== "C-one|S1|S2|S3") throw new Error(`Block swap went wrong: ${afterSwap.join("|")}`);

  // Off-plate drop is refused and highlighted.
  await page.locator('[data-well="C1"]').click();
  await page.locator('[data-well="C3"]').click({ modifiers: ["Shift"] });
  await dragBetween(page, "C1", "C11", { release: false });
  const refused = await classesOf(page, ["C11", "C12"]);
  if (!refused.C11.includes("drop-invalid")) throw new Error(`Off-plate drop was not marked red: ${JSON.stringify(refused)}`);
  await page.mouse.up();
  if ((await sampleAt(page, "C11")) || (await sampleAt(page, "C1")) !== "S1") throw new Error("A refused drop still changed the plate.");

  // Escape cancels a drag.
  await dragBetween(page, "C1", "F1", { release: false });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  if ((await sampleAt(page, "F1")) || (await sampleAt(page, "C1")) !== "S1") throw new Error("Escape did not cancel the drag.");

  // Copy C1–C3, hover E5: preview lands E5–E7, paste keeps direction.
  await page.locator('[data-well="C1"]').click();
  await page.locator('[data-well="C3"]').click({ modifiers: ["Shift"] });
  await page.keyboard.press(`${modifier}+c`);
  await assign(page, ["E6"], "Occupied");
  await page.locator('[data-well="C1"]').click();
  await page.locator('[data-well="C3"]').click({ modifiers: ["Shift"] });
  await page.keyboard.press(`${modifier}+c`);
  const target = await center(page, "E5");
  await page.mouse.move(target.x, target.y);
  const pastePreview = await classesOf(page, ["E5", "E6", "E7", "E8"]);
  await page.screenshot({ path: resolve(outputDirectory, "paste-preview.png") });
  if (!pastePreview.E5.includes("paste-target") || !pastePreview.E6.includes("paste-overwrite") || !pastePreview.E7.includes("paste-target") || pastePreview.E8.length) throw new Error(`Paste preview is wrong: ${JSON.stringify(pastePreview)}`);
  await page.keyboard.press(`${modifier}+v`);
  const pasted = [await sampleAt(page, "E5"), await sampleAt(page, "E6"), await sampleAt(page, "E7")];
  if (pasted.join("|") !== "S1|S2|S3") throw new Error(`Paste did not write the copied block: ${pasted.join("|")}`);

  // Off-plate paste is refused.
  const edge = await center(page, "H11");
  await page.mouse.move(edge.x, edge.y);
  const edgePreview = await classesOf(page, ["H11", "H12"]);
  if (!edgePreview.H11.includes("paste-invalid")) throw new Error(`Off-plate paste preview was not red: ${JSON.stringify(edgePreview)}`);
  await page.keyboard.press(`${modifier}+v`);
  if (await sampleAt(page, "H11")) throw new Error("Off-plate paste changed the plate.");

  // Without hovering, paste starts at the first selected well.
  await page.mouse.move(2, 2);
  await page.locator('[data-well="G2"]').click();
  await page.mouse.move(2, 2);
  await page.keyboard.press(`${modifier}+v`);
  const fallback = [await sampleAt(page, "G2"), await sampleAt(page, "G3"), await sampleAt(page, "G4")];
  if (fallback.join("|") !== "S1|S2|S3") throw new Error(`Paste without hover did not start at the selected well: ${fallback.join("|")}`);

  // Undo reverts the last paste in one step; Escape clears the preview.
  await page.keyboard.press(`${modifier}+z`);
  if (await sampleAt(page, "G2")) throw new Error("Undo did not revert the paste.");
  await page.keyboard.press("Escape");
  const cleared = await page.locator(".paste-target, .paste-overwrite, .paste-invalid").count();
  if (cleared) throw new Error("Escape did not clear the paste preview.");

  // Typing in a field keeps native copy and paste.
  const field = page.locator("#projectName");
  await field.fill("Paste-safe name");
  await field.focus();
  await page.keyboard.press(`${modifier}+a`);
  await page.keyboard.press(`${modifier}+c`);
  if (await page.locator(".paste-target").count()) throw new Error("Copying text in a field armed the well clipboard.");

  // A copy can be pasted onto another plate of the workspace; parameters travel by name.
  await page.locator('[data-well="E5"]').click();
  await page.locator('[data-well="E7"]').click({ modifiers: ["Shift"] });
  await page.keyboard.press(`${modifier}+c`);
  await page.locator("#addPlateButton").click();
  await page.locator('.plate-option[data-size="96"]').click();
  const otherPlate = await center(page, "B2");
  await page.mouse.move(otherPlate.x, otherPlate.y);
  await page.keyboard.press(`${modifier}+v`);
  const crossPlate = [await sampleAt(page, "B2"), await sampleAt(page, "B3"), await sampleAt(page, "B4")];
  if (crossPlate.join("|") !== "S1|S2|S3") throw new Error(`Paste onto another plate failed: ${crossPlate.join("|")}`);

  await page.screenshot({ path: resolve(outputDirectory, "move-paste-final.png") });
  return { rotate: afterRotate, swap: afterSwap, paste: pasted, fallback, crossPlate };
}
