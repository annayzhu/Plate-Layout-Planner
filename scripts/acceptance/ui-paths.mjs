// The planner's real paths to controls that live in the mix drawer or in a menu.
export async function openLiquidModule(page, module) {
  if (await page.locator("#liquidDrawer").isHidden()) await page.locator("#openMixButton").click();
  await page.locator(`#liquidModuleTabs [data-liquid-module="${module}"]`).click();
}

export async function openLiquidPlanView(page) {
  if (await page.locator("#liquidDrawer").isHidden()) await page.locator("#openMixButton").click();
  if ((await page.locator("#liquidPlanViewButton").getAttribute("aria-pressed")) !== "true") await page.locator("#liquidPlanViewButton").click();
}

export async function closeLiquidDrawer(page) {
  if (await page.locator("#liquidDrawer").isVisible()) await page.locator("#closeLiquidDrawerButton").click();
}

export async function clickMenuItem(page, selector) {
  const item = page.locator(selector);
  const menu = item.locator("xpath=ancestor::details[1]");
  if ((await menu.getAttribute("open")) === null) await menu.locator("summary").click();
  await item.click();
}
