// Tests for public/static/js/nav-progress.js — the decision of whether a
// click is a screen switch worth covering with the loading overlay.
//
// Run with:  bun test tests/js/

import { test } from "node:test";
import assert from "node:assert/strict";

import { shouldShowNavProgress } from "../../public/static/js/nav-progress.js";

const GAME = "https://loto.1ly.dev/s/ABC123/";

function click(overrides) {
  return {
    href: "https://loto.1ly.dev/s/ABC123/settings",
    currentHref: GAME,
    target: "",
    download: false,
    button: 0,
    modifier: false,
    defaultPrevented: false,
    ...overrides,
  };
}

test("a plain left click on another screen shows the overlay", () => {
  assert.equal(shouldShowNavProgress(click({})), true);
  assert.equal(
    shouldShowNavProgress(click({ href: `${GAME}display` })),
    true,
  );
});

test("the current screen's own tab does not", () => {
  assert.equal(shouldShowNavProgress(click({ href: GAME })), false);
});

test("an in-page hash jump does not, it loads nothing", () => {
  assert.equal(shouldShowNavProgress(click({ href: `${GAME}#rules` })), false);
});

test("a query change on the same page still counts as a load", () => {
  assert.equal(shouldShowNavProgress(click({ href: `${GAME}?new=1` })), true);
});

test("a link that leaves this document's origin does not", () => {
  assert.equal(
    shouldShowNavProgress(click({ href: "https://lucide.dev/icons" })),
    false,
  );
  assert.equal(
    shouldShowNavProgress(click({ href: "mailto:host@example.com" })),
    false,
  );
});

test("a link opening elsewhere does not, this document stays put", () => {
  assert.equal(shouldShowNavProgress(click({ target: "_blank" })), false);
  assert.equal(shouldShowNavProgress(click({ target: "_self" })), true);
});

test("a download does not, the page stays put", () => {
  assert.equal(shouldShowNavProgress(click({ download: true })), false);
});

test("a modified or non-primary click does not, it opens a tab or nothing", () => {
  assert.equal(shouldShowNavProgress(click({ modifier: true })), false);
  assert.equal(shouldShowNavProgress(click({ button: 1 })), false);
  assert.equal(shouldShowNavProgress(click({ button: 2 })), false);
});

test("a click another handler already claimed does not", () => {
  assert.equal(shouldShowNavProgress(click({ defaultPrevented: true })), false);
});

test("an unparseable href does not", () => {
  assert.equal(shouldShowNavProgress(click({ href: "" })), false);
});
