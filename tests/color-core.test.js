const test = require("node:test");
const assert = require("node:assert/strict");

const Color = require("../color-core.js");

test("distinct parameter categories receive distinct stable colors", () => {
  const values = ["Mock", "NC-FAM", "siFBN2-1", "siFBN2-2", "siFBN2-3", "siFBN2-4"];
  const registry = Color.createCategoryRegistry(values);

  assert.notDeepEqual(registry.colorFor("NC-FAM"), registry.colorFor("siFBN2-1"));
  assert.deepEqual(registry.colorFor("siFBN2-1"), registry.colorFor("siFBN2-1"));
  assert.equal(new Set(values.map((value) => registry.colorFor(value).join("|"))).size, values.length);
});

test("large category sets remain unique and invalid values stay neutral", () => {
  const values = Array.from({ length: 20 }, (_, index) => `Group ${index + 1}`);
  const registry = Color.createCategoryRegistry([...values, null, "", Number.NaN, { bad: true }]);

  assert.equal(new Set(values.map((value) => registry.colorFor(value).join("|"))).size, values.length);
  assert.deepEqual(registry.colorFor(null), Color.NEUTRAL_COLOR);
  assert.deepEqual(registry.colorFor(""), Color.NEUTRAL_COLOR);
  assert.deepEqual(registry.colorFor({ bad: true }), Color.NEUTRAL_COLOR);
});
