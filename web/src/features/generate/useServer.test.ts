import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONTRACT_VERSION, type ServerHealth } from "@/engine/solveClient";
import { pollServer, statusFrom, useServerStore } from "./useServer";

const online: ServerHealth = { online: true, contract: CONTRACT_VERSION };
const other: ServerHealth = { online: true, contract: CONTRACT_VERSION + 1 };
const down: ServerHealth = { online: false, contract: null };

describe("statusFrom", () => {
  it("online, offline, and a contract mismatch only while online", () => {
    expect(statusFrom(online)).toEqual({ server: "online", contractMismatch: false });
    expect(statusFrom(other)).toEqual({ server: "online", contractMismatch: true });
    expect(statusFrom({ online: true, contract: null })).toEqual({ server: "online", contractMismatch: true });
    expect(statusFrom(down)).toEqual({ server: "offline", contractMismatch: false });
  });
});

describe("pollServer", () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(async () => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await pollServer(async () => online); // a known state, and the "last logged" version cleared
    warn.mockClear();
  });
  afterEach(() => warn.mockRestore());

  it("stores the answer for every step to read", async () => {
    await pollServer(async () => down);
    expect(useServerStore.getState()).toEqual({ server: "offline", contractMismatch: false });
    await pollServer(async () => other);
    expect(useServerStore.getState()).toEqual({ server: "online", contractMismatch: true });
  });

  it("joins a check already under way instead of starting another", async () => {
    let answer!: (h: ServerHealth) => void;
    const slow = vi.fn(() => new Promise<ServerHealth>((r) => (answer = r)));
    const first = pollServer(slow);
    const second = pollServer(slow);
    expect(slow).toHaveBeenCalledOnce();
    answer(down);
    await Promise.all([first, second]);
    expect(useServerStore.getState().server).toBe("offline");
    await pollServer(slow.mockImplementation(async () => online));
    expect(slow).toHaveBeenCalledTimes(2); // a new check once the first is done
  });

  it("logs a different contract version once, not on every poll", async () => {
    await pollServer(async () => other);
    await pollServer(async () => other);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toBe(`Solver contract version ${CONTRACT_VERSION + 1}, this page expects ${CONTRACT_VERSION}.`);
    await pollServer(async () => ({ online: true, contract: null }));
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[1][0]).toMatch(/version missing/);
  });

  it("logs again if the mismatch goes away and comes back", async () => {
    await pollServer(async () => other);
    await pollServer(async () => online);
    await pollServer(async () => other);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("logs nothing while the versions match or the server is offline", async () => {
    await pollServer(async () => online);
    await pollServer(async () => down);
    expect(warn).not.toHaveBeenCalled();
  });
});
