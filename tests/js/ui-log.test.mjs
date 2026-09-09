// Tests for public/static/js/ui-log.js — the signature that decides whether
// the event log is worth rebuilding. It must fold in everything the rendered
// row shows, so an unrelated state push (an SSE heartbeat) does not reflow the
// list, while the draw that closes a rollback window does.
//
// Run with:  bun test tests/js/

import { test } from "node:test";
import assert from "node:assert/strict";

import { logSignature } from "../../public/static/js/ui-log.js";

function state(events, calledCount) {
  return { called: Array.from({ length: calledCount }, (_, i) => i + 1), events };
}

const win = (over) => ({ cid: "a1", level: 1, seq: 1, ts: "12:00", callCount: 3, status: "confirmed", ...over });

test("logSignature: no events is the empty signature", () => {
  assert.equal(logSignature(state([], 0)), "");
});

test("logSignature: a fresh confirmed win is still reopenable", () => {
  assert.equal(logSignature(state([win()], 3)), "a1:1:3confirmedr");
});

test("logSignature: the same state twice signs identically", () => {
  const s = state([win()], 3);
  assert.equal(logSignature(s), logSignature(state([win()], 3)));
});

test("logSignature: the signature flips once the rollback window closes", () => {
  assert.equal(logSignature(state([win()], 8)), "a1:1:3confirmedr");
  assert.equal(logSignature(state([win()], 9)), "a1:1:3confirmedl");
});

test("logSignature: a pending row is never reopenable", () => {
  assert.equal(logSignature(state([win({ status: "pending" })], 3)), "a1:1:3pendingl");
});

test("logSignature: a status-less legacy row signs with an empty status", () => {
  assert.equal(logSignature(state([win({ status: undefined })], 3)), "a1:1:3l");
});

test("logSignature: rows are joined so a new row changes the signature", () => {
  const first = win();
  const second = win({ cid: "b2", level: 2, callCount: 4 });
  assert.equal(logSignature(state([first, second], 4)), "a1:1:3confirmedr|b2:2:4confirmedr");
  assert.notEqual(logSignature(state([first, second], 4)), logSignature(state([first], 4)));
});

test("logSignature: an absent row signs differently from a confirmed one", () => {
  assert.notEqual(
    logSignature(state([win({ status: "absent" })], 3)),
    logSignature(state([win()], 3)),
  );
});
