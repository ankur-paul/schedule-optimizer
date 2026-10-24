import { describe, expect, it } from "vitest";
import {
  actionDone,
  actionQuestion,
  confirmedRecently,
  emailSignInAt,
  needsEmailConfirmation,
  parsePending,
  PENDING_TTL_MS,
  sendErrorMessage,
  tokenClaims,
  type PendingAction,
} from "./emailConfirm";

/** An unsigned JWT with these claims, base64url-encoded (UTF-8) like Supabase's. */
function jwt(claims: object): string {
  return `eyJhbGciOiJIUzI1NiJ9.${base64url(JSON.stringify(claims))}.signature`;
}

function base64url(text: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(text))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const NOW = 1_792_843_332_000; // ms
const sec = NOW / 1000;

describe("tokenClaims", () => {
  it("reads the payload, including base64url characters and missing padding", () => {
    expect(tokenClaims(jwt({ sub: "u1", name: "Ä?>~" }))).toEqual({ sub: "u1", name: "Ä?>~" });
  });

  it("is null for anything that isn't a JWT", () => {
    for (const t of [undefined, null, "", "abc", "a.!!!.c", `a.${base64url("[1]x")}.c`]) expect(tokenClaims(t)).toBeNull();
    expect(tokenClaims(`a.${base64url("42")}.c`)).toBeNull();
  });
});

describe("emailSignInAt", () => {
  it("takes the latest otp or magiclink entry", () => {
    const token = jwt({ amr: [{ method: "otp", timestamp: 100 }, { method: "oauth", timestamp: 300 }, { method: "magiclink", timestamp: 200 }] });
    expect(emailSignInAt(token)).toBe(200);
  });

  it("is null for Google or password sign-ins, a missing amr, or junk entries", () => {
    expect(emailSignInAt(jwt({ amr: [{ method: "oauth", timestamp: 1 }] }))).toBeNull();
    expect(emailSignInAt(jwt({ amr: [{ method: "password", timestamp: 1 }] }))).toBeNull();
    expect(emailSignInAt(jwt({}))).toBeNull();
    expect(emailSignInAt(jwt({ amr: "otp" }))).toBeNull();
    expect(emailSignInAt(jwt({ amr: [null, { method: "otp", timestamp: "1" }] }))).toBeNull();
  });
});

describe("confirmedRecently", () => {
  const at = (ago: number) => jwt({ amr: [{ method: "otp", timestamp: sec - ago }] });

  it("accepts an email sign-in from the last few minutes", () => {
    expect(confirmedRecently(at(0), NOW)).toBe(true);
    expect(confirmedRecently(at(9 * 60), NOW)).toBe(true);
  });

  it("asks again near the end of the 10-minute window, and after it", () => {
    expect(confirmedRecently(at(10 * 60 - 20), NOW)).toBe(false);
    expect(confirmedRecently(at(11 * 60), NOW)).toBe(false);
  });

  it("asks a Google user, or with no session token", () => {
    expect(confirmedRecently(jwt({ amr: [{ method: "oauth", timestamp: sec }] }), NOW)).toBe(false);
    expect(confirmedRecently(undefined, NOW)).toBe(false);
  });
});

const handover: PendingAction = {
  kind: "make_admin",
  instituteId: "i1",
  instituteName: "GNDEC",
  userId: "u2",
  userLabel: "Bela Kaur",
  by: "u1",
  at: NOW,
};
const leave: PendingAction = { kind: "leave", instituteId: "i1", instituteName: "GNDEC", by: "u1", at: NOW };

describe("actionQuestion and actionDone", () => {
  it("say what happens in words", () => {
    expect(actionQuestion(handover)).toBe("Make Bela Kaur the admin of GNDEC? You'll become an editor.");
    expect(actionQuestion(leave)).toMatch(/^Leave GNDEC\?/);
    expect(actionDone(handover)).toBe("Bela Kaur is now the admin. You're an editor.");
    expect(actionDone(leave)).toBe("You left GNDEC.");
  });
});

describe("parsePending", () => {
  it("returns the stored action for its own user while it's fresh", () => {
    expect(parsePending(JSON.stringify(handover), "u1", NOW + 1000)).toEqual(handover);
    expect(parsePending(JSON.stringify(leave), "u1", NOW + PENDING_TTL_MS)).toEqual(leave);
  });

  it("ignores another user's action, an expired one, or one from the future", () => {
    expect(parsePending(JSON.stringify(handover), "u2", NOW)).toBeNull();
    expect(parsePending(JSON.stringify(handover), "u1", NOW + PENDING_TTL_MS + 1)).toBeNull();
    expect(parsePending(JSON.stringify(handover), "u1", NOW - 1)).toBeNull();
  });

  it("ignores nothing stored, junk, or a malformed action", () => {
    expect(parsePending(null, "u1", NOW)).toBeNull();
    expect(parsePending("{not json", "u1", NOW)).toBeNull();
    expect(parsePending(JSON.stringify({ ...handover, kind: "delete" }), "u1", NOW)).toBeNull();
    expect(parsePending(JSON.stringify({ ...handover, userId: 5 }), "u1", NOW)).toBeNull();
  });
});

describe("needsEmailConfirmation", () => {
  it("spots T26's refusal by its hint only", () => {
    expect(needsEmailConfirmation({ hint: "email_confirmation_required" })).toBe(true);
    expect(needsEmailConfirmation({ hint: null })).toBe(false);
    expect(needsEmailConfirmation({})).toBe(false);
  });
});

describe("sendErrorMessage", () => {
  it("explains the email rate limit", () => {
    expect(sendErrorMessage({ code: "over_email_send_rate_limit" })).toMatch(/Too many emails/);
    expect(sendErrorMessage({ status: 429 })).toMatch(/Too many emails/);
  });

  it("passes other messages through", () => {
    expect(sendErrorMessage({ message: "Signups not allowed for otp" })).toBe("Couldn't send the email: Signups not allowed for otp");
    expect(sendErrorMessage({})).toBe("Couldn't send the email. Try again.");
  });
});
