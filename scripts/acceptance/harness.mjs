import { mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const XlsxCore = require("../../xlsx-core.js");

async function loadChromium() {
  const playwrightModule = process.env.PLAYWRIGHT_MODULE_URL || "playwright";
  try {
    return (await import(playwrightModule)).chromium;
  } catch (error) {
    throw new Error(
      "Browser acceptance tests require Playwright. Install it or set PLAYWRIGHT_MODULE_URL to its index.mjs file.",
      { cause: error },
    );
  }
}

function safeFilename(name) {
  return String(name).replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "journey";
}

export function assertTextOrder(text, tokens, label) {
  let cursor = -1;
  for (const token of tokens) {
    const next = text.indexOf(token, cursor + 1);
    if (next < 0) throw new Error(`${label} is missing or misorders “${token}”: ${text.slice(0, 900)}`);
    cursor = next;
  }
}

export async function createAcceptanceHarness({
  baseUrl = process.env.ACCEPTANCE_BASE_URL || "http://127.0.0.1:4186/",
  outputDirectory = "artifacts/visual-smoke",
  viewport = { width: 1500, height: 1100 },
} = {}) {
  const chromium = await loadChromium();
  const resolvedOutput = resolve(outputDirectory);
  await mkdir(resolvedOutput, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}),
  });
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, acceptDownloads: true });
  const origin = new URL(baseUrl).origin;
  if (/^https?:/.test(origin)) await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  async function clearPersistence() {
    await page.evaluate(async () => {
      localStorage.clear();
      await new Promise((done) => {
        const request = indexedDB.deleteDatabase("plate-layout-studio");
        request.onsuccess = request.onerror = request.onblocked = done;
      });
    });
  }

  async function openClean() {
    errors.length = 0;
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await clearPersistence();
    await page.reload({ waitUntil: "networkidle" });
  }

  async function persistWorkspace(workspace) {
    // Leave the running application before injecting state. This lets any queued
    // autosave finish first instead of racing with the deterministic fixture.
    const errorCountBeforeFixturePage = errors.length;
    const fixtureUrl = new URL(`__acceptance_fixture__?run=${Date.now()}`, baseUrl).href;
    await page.route(fixtureUrl, (route) => route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: "<!doctype html><meta charset=utf-8><link rel=icon href=data:,><title>Acceptance fixture host</title>",
    }));
    await page.goto(fixtureUrl, { waitUntil: "domcontentloaded" });
    await page.unroute(fixtureUrl);
    // Ignore only errors emitted by the neutral navigation; errors from the
    // application loaded below remain part of the journey result. This fallback
    // also keeps diagnostics deterministic if a hosting adapter omits test files.
    errors.splice(errorCountBeforeFixturePage);
    await page.evaluate(async (value) => {
      const key = "plate-layout-studio:workspace:v2";
      localStorage.setItem(key, JSON.stringify(value));
      await new Promise((done, reject) => {
        const request = indexedDB.open("plate-layout-studio", 1);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains("workspaces")) request.result.createObjectStore("workspaces");
        };
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction("workspaces", "readwrite");
          transaction.objectStore("workspaces").put(value, "active");
          transaction.oncomplete = () => { database.close(); done(); };
          transaction.onerror = () => reject(transaction.error);
        };
        request.onerror = () => reject(request.error);
      });
    }, workspace);
    await page.goto(baseUrl, { waitUntil: "networkidle" });
  }

  async function readWorkspace() {
    return page.evaluate(() => JSON.parse(localStorage.getItem("plate-layout-studio:workspace:v2")));
  }

  async function download(action) {
    const pending = page.waitForEvent("download");
    await action();
    const item = await pending;
    const path = await item.path();
    return { item, path, bytes: await readFile(path) };
  }

  async function downloadText(action) {
    const result = await download(action);
    return { ...result, text: result.bytes.toString("utf8") };
  }

  async function downloadWorkbook(action) {
    const result = await download(action);
    return { ...result, workbook: await XlsxCore.parseWorkbook(result.bytes) };
  }

  async function runJourney(name, journey, { clean = true } = {}) {
    const started = Date.now();
    try {
      if (clean) await openClean();
      const result = await journey({
        page,
        context,
        errors,
        baseUrl,
        outputDirectory: resolvedOutput,
        persistWorkspace,
        readWorkspace,
        clearPersistence,
        download,
        downloadText,
        downloadWorkbook,
        assertTextOrder,
        XlsxCore,
      });
      if (errors.length) throw new Error(`Browser errors:\n${errors.join("\n")}`);
      return { name, status: "passed", durationMs: Date.now() - started, result: result || null };
    } catch (error) {
      const screenshot = resolve(resolvedOutput, `failure-${safeFilename(name)}.png`);
      await page.screenshot({ path: screenshot, fullPage: true }).catch(() => {});
      throw new Error(`[journey:${name}] ${error.message}\nFailure screenshot: ${screenshot}`, { cause: error });
    }
  }

  return {
    browser,
    context,
    page,
    errors,
    baseUrl,
    outputDirectory: resolvedOutput,
    readWorkspace,
    XlsxCore,
    clearPersistence,
    openClean,
    persistWorkspace,
    download,
    downloadText,
    downloadWorkbook,
    runJourney,
    close: () => browser.close(),
  };
}
