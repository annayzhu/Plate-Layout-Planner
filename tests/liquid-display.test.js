const test = require("node:test");
const assert = require("node:assert/strict");
const Display = require("../liquid-display.js");

test("volumes show four significant figures", () => {
  assert.equal(Display.significant(3.4375), "3.438");
  assert.equal(Display.significant(1096.5625), "1,097");
  assert.equal(Display.significant(110), "110");
  assert.equal(Display.significant(0.0123456), "0.01235");
  assert.equal(Display.significant(13200), "13,200");
  assert.equal(Display.significant(0), "0");
  assert.equal(Display.significant(Number.NaN), "—");
});

test("only volumes inside text are rounded", () => {
  assert.equal(Display.volumesInText("每孔 3.4375 µL，共 1,096.5625 µL"), "每孔 3.438 µL，共 1,097 µL");
  assert.equal(Display.volumesInText("Drug A 0.78125 nM · 12.34567%"), "Drug A 0.78125 nM · 12.34567%");
  assert.equal(Display.volumesInText("10,20 µL"), "10,20 µL");
  assert.equal(Display.volumesInText("2.5 mL / 1000.5 uL"), "2.5 mL / 1,001 uL");
});

test("bare numbers follow the column header", () => {
  assert.equal(Display.tableCell(3.4375, "每孔 µL"), "3.438");
  assert.equal(Display.tableCell("1096.5625", "Batch incl. overage µL"), "1,097");
  assert.equal(Display.tableCell(3.4375, "级别"), "3.4375");
  assert.deepEqual(Display.tableRows(["组分", "每孔 µL"], [["Mix", 10.123456]]), [["Mix", "10.12"]]);
});
