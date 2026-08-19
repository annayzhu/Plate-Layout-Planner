const test = require("node:test");
const assert = require("node:assert/strict");
const Core = require("../core.js");

test("builds 6, 12, 24, 96 and 384 well identifiers", () => {
  assert.deepEqual(Core.makeWellIds(6), ["A1", "A2", "A3", "B1", "B2", "B3"]);
  assert.equal(Core.makeWellIds(12).at(-1), "C4");
  assert.equal(Core.makeWellIds(24).length, 24);
  assert.equal(Core.makeWellIds(96).at(-1), "H12");
  assert.equal(Core.makeWellIds(384).length, 384);
  assert.equal(Core.makeWellIds(384).at(-1), "P24");
});

test("shift range follows row-major plate order", () => {
  assert.deepEqual(Core.rangeSelection(24, "A5", "B2"), ["A5", "A6", "B1", "B2"]);
  assert.deepEqual(Core.rangeSelection(6, "B2", "A3"), ["A3", "B1", "B2"]);
});

test("rectangle selection includes the geometric block", () => {
  assert.deepEqual(Core.rectangleSelection(24, "B2", "D4"), [
    "B2", "B3", "B4", "C2", "C3", "C4", "D2", "D3", "D4",
  ]);
});

test("calculation filters wells and multiplies two numeric parameters", () => {
  const wellMap = {
    A1: { params: { group: "drug", value: 2, factor: 3 } },
    A2: { params: { group: "control", value: 4, factor: 10 } },
    A3: { params: { group: "drug", value: "bad", factor: 3 } },
  };
  const result = Core.calculateWells({
    wellMap,
    wellIds: ["A1", "A2", "A3"],
    conditionId: "group",
    conditionValue: "drug",
    sourceId: "value",
    operation: "multiply",
    operandMode: "parameter",
    operandId: "factor",
    outputId: "result",
    precision: 4,
  });
  assert.equal(result.updated, 1);
  assert.equal(result.skipped, 1);
  assert.equal(result.nextWells.A1.params.result, 6);
  assert.equal(result.nextWells.A2.params.result, undefined);
});

test("division by zero is skipped", () => {
  const result = Core.calculateWells({
    wellMap: { A1: { params: { value: 3 } } },
    wellIds: ["A1"],
    sourceId: "value",
    operation: "divide",
    operandMode: "constant",
    operandValue: 0,
    outputId: "result",
  });
  assert.equal(result.updated, 0);
  assert.equal(result.skipped, 1);
});
