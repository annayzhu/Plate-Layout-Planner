const test = require("node:test");
const assert = require("node:assert/strict");
const Core = require("../core.js");

const well = (name) => ({ params: { sample: name } });

test("dragging a block onto a separate block swaps them in the same shape", () => {
  const wells = { A1: well("a1"), A2: well("a2"), C1: well("c1"), C2: well("c2") };
  const plan = Core.planSwap(96, ["A1", "A2"], "A1", "C1");
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.landing, ["C1", "C2"]);
  assert.deepEqual(plan.displaced, ["C1", "C2"]);
  const next = Core.applyMoves(wells, plan.moves);
  assert.deepEqual(next, { C1: well("a1"), C2: well("a2"), A1: well("c1"), A2: well("c2") });
});

test("an overlapping shift rotates the displaced well into the vacated one", () => {
  const wells = { A1: well("1"), A2: well("2"), A3: well("3"), A4: well("4") };
  const plan = Core.planSwap(96, ["A1", "A2", "A3"], "A2", "A3");
  assert.deepEqual(plan.landing, ["A2", "A3", "A4"]);
  assert.deepEqual(plan.displaced, ["A4"]);
  assert.deepEqual(Core.applyMoves(wells, plan.moves), { A2: well("1"), A3: well("2"), A4: well("3"), A1: well("4") });
});

test("empty wells move too, so a filled well dragged onto an empty one leaves an empty well behind", () => {
  const plan = Core.planSwap(96, ["B2"], "B2", "D5");
  assert.deepEqual(Core.applyMoves({ B2: well("x") }, plan.moves), { D5: well("x") });
});

test("scattered selections keep their gaps and swap with what they land on", () => {
  const wells = { A1: well("a1"), B3: well("b3"), A2: well("a2"), B4: well("b4") };
  const plan = Core.planSwap(96, ["A1", "B3"], "A1", "A2");
  assert.deepEqual(plan.landing, ["A2", "B4"]);
  assert.deepEqual(Core.applyMoves(wells, plan.moves), { A2: well("a1"), B4: well("b3"), A1: well("a2"), B3: well("b4") });
});

test("a drop that pushes any well off the plate is refused", () => {
  const plan = Core.planSwap(96, ["A11", "A12"], "A11", "A12");
  assert.equal(plan.ok, false);
  assert.equal(plan.reason, "out-of-bounds");
  assert.deepEqual(plan.moves, []);
});

test("dropping on the starting well changes nothing", () => {
  const plan = Core.planSwap(96, ["A1", "A2"], "A2", "A2");
  assert.equal(plan.unchanged, true);
  assert.deepEqual(plan.moves, []);
});

test("every move plan is a permutation of the wells it touches", () => {
  const ids = Core.makeWellIds(96);
  for (const [selection, from, to] of [[["A1", "A2", "B1", "B2"], "A1", "B2"], [["C3", "E7", "F1"], "E7", "D8"], [["H1"], "H1", "A12"]]) {
    const plan = Core.planSwap(96, selection, from, to);
    const wells = Object.fromEntries(ids.map((id) => [id, well(id)]));
    const next = Core.applyMoves(wells, plan.moves);
    assert.equal(Object.keys(next).length, 96);
    assert.deepEqual(Object.values(next).map((item) => item.params.sample).sort(), ids.slice().sort());
  }
});

test("paste lines the first copied well up with the target and keeps direction", () => {
  const clipboard = Core.copyShape(96, ["B3", "A2", "B2"], (id) => `v-${id}`);
  assert.deepEqual(clipboard.items.map((item) => [item.rowOffset, item.columnOffset, item.value]), [[0, 0, "v-A2"], [1, 0, "v-B2"], [1, 1, "v-B3"]]);
  const plan = Core.planPaste(96, clipboard, "E5", ["F5"]);
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.targets.map((target) => [target.wellId, target.value]), [["E5", "v-A2"], ["F5", "v-B2"], ["F6", "v-B3"]]);
  assert.deepEqual(plan.overwritten, ["F5"]);
});

test("copied empty wells keep the shape but are not pasted", () => {
  const clipboard = Core.copyShape(96, ["A1", "A2", "A3"], (id) => (id === "A1" ? null : id));
  const plan = Core.planPaste(96, clipboard, "C4", ["C4"]);
  assert.deepEqual(plan.targets.map((target) => target.wellId), ["C5", "C6"]);
  assert.deepEqual(plan.overwritten, []);
});

test("paste that would leave the plate is refused and says how many wells fall off", () => {
  const clipboard = Core.copyShape(96, ["A1", "A2", "A3"], (id) => id);
  const plan = Core.planPaste(96, clipboard, "A11", []);
  assert.equal(plan.ok, false);
  assert.equal(plan.reason, "out-of-bounds");
  assert.equal(plan.outside, 1);
  assert.deepEqual(plan.targets.map((target) => target.wellId), ["A11", "A12"]);
});

test("a 96-well copy pastes into a 384-well plate by row and column", () => {
  const clipboard = Core.copyShape(96, ["H11", "H12"], (id) => id);
  const plan = Core.planPaste(384, clipboard, "P23", []);
  assert.deepEqual(plan.targets.map((target) => target.wellId), ["P23", "P24"]);
});
