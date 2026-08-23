import { issue28Workspace } from "../fixtures.mjs";

async function currentPlanState(page) {
  return page.evaluate(() => {
    const workspace = JSON.parse(localStorage.getItem("plate-layout-studio:workspace:v2"));
    const plate = workspace.plates.find((item) => item.id === workspace.activePlateId);
    return { current: plate?.liquidPlans || [], archived: plate?.archivedLiquidPlans || [] };
  });
}

export async function liquidPlanLifecycleJourney({ page, persistWorkspace }) {
  await page.locator('[data-well="A1"]').click();
  await page.locator('.liquid-module-launch[data-liquid-module="transfection"]').click();
  const form = page.locator("#liquidActiveForm");
  await form.locator('button[type="submit"]').click();
  if (!(await page.locator("#liquidResultHost").innerText()).includes("新计算 · 尚未保存")) throw new Error("A new calculation was not labelled as an unpublished draft.");
  await page.locator('[data-liquid-action="save"]').click();
  const created = await currentPlanState(page);
  if (created.current.length !== 1 || created.current[0].status !== "saved") throw new Error("First save did not create exactly one current plan.");

  await form.locator('[name="cargoName"]').fill("updated-siRNA");
  await form.locator('button[type="submit"]').click();
  if ((await page.locator('[data-liquid-action="save"]').innerText()).trim() !== "更新已保存方案") throw new Error("A later calculation did not expose the update action.");
  await page.locator('[data-liquid-action="save"]').click();
  const updated = await currentPlanState(page);
  if (updated.current.length !== 1 || updated.current[0].id !== created.current[0].id) throw new Error("Update did not atomically replace the plan while preserving identity.");

  await page.locator("#closeLiquidDrawerButton").click();
  await page.locator('[data-well="A1"]').click();
  const sampleRow = page.locator(".parameter-input-row").filter({ hasText: "样本" });
  await sampleRow.locator(".parameter-value").fill("changed-after-save");
  await page.locator("#applyParametersButton").click();
  if (!(await page.locator("#savedLiquidPlanList").innerText()).includes("需重算")) throw new Error("A plate edit did not mark the saved plan stale.");
  const stale = await currentPlanState(page);
  if (!stale.current[0]?.stale) throw new Error("Stale state was not persisted.");

  await page.locator('[data-liquid-plan-action="clear"]').click();
  await page.locator('[data-liquid-plan-action="clear"]').click();
  if ((await currentPlanState(page)).current.length !== 0) throw new Error("Two-step clear did not remove the plate plan.");

  await persistWorkspace(issue28Workspace({ legacyDuplicateOnFirstPlate: true }));
  const migrated = await currentPlanState(page);
  if (migrated.current.length !== 1 || migrated.archived.length !== 1) throw new Error(`Legacy duplicates did not converge to one current plan and one archive: ${JSON.stringify(migrated)}`);
  if (!(await page.locator("#savedLiquidPlanList").innerText()).includes("已生效")) throw new Error("Migrated current plan is not visibly active.");
  return { stableId: created.current[0].id, migratedArchiveCount: migrated.archived.length };
}
