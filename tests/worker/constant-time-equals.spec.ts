// Characterization of the constant-time comparator that gates every
// write: the admin password (checkBasicAuth) and the owner token
// (GameRoom.verifyOwner). Both call sites reject a length mismatch
// before comparing, and neither leaks anything beyond that on a
// mismatch. These tests pin equal / differing-same-length / shorter /
// longer / empty at both gates so the shared comparator cannot drift.

import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { checkBasicAuth } from "../../src/auth.js";

const PASSWORD = "test-password";
const basic = (user: string, pass: string) =>
  `Basic ${btoa(`${user}:${pass}`)}`;

function room(name: string) {
  return env.GAME_ROOM.get(env.GAME_ROOM.idFromName(name));
}

describe("checkBasicAuth password comparison", () => {
  it("accepts the exact password", () => {
    expect(checkBasicAuth(basic("admin", PASSWORD), PASSWORD)).toBe(true);
  });

  it("rejects a password differing only in one character", () => {
    expect(checkBasicAuth(basic("admin", "test-passwerd"), PASSWORD)).toBe(
      false,
    );
  });

  it("rejects a correct prefix that is too short", () => {
    expect(checkBasicAuth(basic("admin", "test-passwor"), PASSWORD)).toBe(
      false,
    );
  });

  it("rejects a correct prefix with extra trailing characters", () => {
    expect(checkBasicAuth(basic("admin", `${PASSWORD}x`), PASSWORD)).toBe(
      false,
    );
  });

  it("rejects an empty password against a set secret", () => {
    expect(checkBasicAuth(basic("admin", ""), PASSWORD)).toBe(false);
  });

  // Fails closed: an unset or empty secret locks the panel rather than
  // matching an empty password, so the comparator is never reached.
  it("rejects everything when the expected password is unset", () => {
    expect(checkBasicAuth(basic("admin", ""), undefined)).toBe(false);
    expect(checkBasicAuth(basic("admin", ""), "")).toBe(false);
    expect(checkBasicAuth(basic("admin", PASSWORD), undefined)).toBe(false);
  });
});

describe("GameRoom.verifyOwner token comparison", () => {
  const TOKEN = "owner-token-abcdef01";

  it("rejects every token while the room is uninitialised", async () => {
    const stub = room("cte-uninitialised");
    expect(await stub.verifyOwner(TOKEN)).toBe(false);
    expect(await stub.verifyOwner("")).toBe(false);
  });

  it("accepts the exact token", async () => {
    const stub = room("cte-exact");
    await stub.init(TOKEN, []);
    expect(await stub.verifyOwner(TOKEN)).toBe(true);
  });

  it("rejects a token differing only in one character", async () => {
    const stub = room("cte-one-char");
    await stub.init(TOKEN, []);
    expect(await stub.verifyOwner("owner-token-abcdef02")).toBe(false);
  });

  it("rejects a correct prefix that is too short", async () => {
    const stub = room("cte-short");
    await stub.init(TOKEN, []);
    expect(await stub.verifyOwner(TOKEN.slice(0, -1))).toBe(false);
  });

  it("rejects a correct prefix with extra trailing characters", async () => {
    const stub = room("cte-long");
    await stub.init(TOKEN, []);
    expect(await stub.verifyOwner(`${TOKEN}x`)).toBe(false);
  });

  it("rejects an empty token", async () => {
    const stub = room("cte-empty");
    await stub.init(TOKEN, []);
    expect(await stub.verifyOwner("")).toBe(false);
  });
});
