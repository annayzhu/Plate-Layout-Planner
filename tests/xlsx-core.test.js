const test = require("node:test");
const assert = require("node:assert/strict");

const Xlsx = require("../xlsx-core.js");

test("builds and reads a real multi-sheet xlsx workbook", async () => {
  const workbook = Xlsx.buildWorkbook({
    sheets: [
      {
        name: "实验总览",
        systemKind: "overview",
        rows: [["板名", "规格"], ["Plate 1", 24], ["Plate 2", 96]],
        freezeRows: 1,
        autoFilter: true,
      },
      {
        name: "Plate 1",
        systemKind: "plate",
        rows: [["孔位", "样本", "剂量 (µM)"], ["A1", "S001", 1], ["A2", "", ""]],
        freezeRows: 1,
        autoFilter: true,
      },
      {
        name: "逐步加样清单",
        systemKind: "pipetting",
        rows: [["执行顺序", "目标板", "目标孔", "每孔加入体积"], [1, "Plate 1", "A1", 10]],
        freezeRows: 1,
        autoFilter: true,
      },
    ],
  });

  assert.ok(workbook instanceof Uint8Array);
  assert.equal(String.fromCharCode(...workbook.slice(0, 2)), "PK");
  const parsed = await Xlsx.parseWorkbook(workbook);
  assert.deepEqual(parsed.sheets.map((sheet) => sheet.name), ["实验总览", "Plate 1", "逐步加样清单"]);
  assert.deepEqual(parsed.sheets[1].rows[1], ["A1", "S001", 1]);
  assert.equal(parsed.sheets[0].freezeRows, 1);
  assert.equal(parsed.sheets[0].autoFilter, true);
  assert.equal(parsed.sheets[0].mergedCells.length, 0);
});

test("sanitizes duplicate and invalid Excel sheet names deterministically", () => {
  assert.deepEqual(
    Xlsx.uniqueSheetNames(["Plate/A", "Plate:A", "A very long plate name that exceeds thirty one characters"]),
    ["Plate A", "Plate A (2)", "A very long plate name that exc"],
  );
});

