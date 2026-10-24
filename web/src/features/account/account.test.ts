import { describe, expect, it } from "vitest";
import { authErrorMessage, avatarUrl, displayName, initials, looksLikeEmail, redirectUrl, withoutAuthError } from "./account";

describe("displayName", () => {
  it("uses Google's full name", () => {
    expect(displayName({ email: "ankur@gmail.com", user_metadata: { full_name: "Ankur Paul", name: "Ankur" } })).toBe("Ankur Paul");
  });

  it("falls back to name, then the email", () => {
    expect(displayName({ email: "a@b.in", user_metadata: { name: "Ankur" } })).toBe("Ankur");
    expect(displayName({ email: "ankur@gndec.ac.in", user_metadata: {} })).toBe("ankur@gndec.ac.in");
    expect(displayName({ email: "ankur@gndec.ac.in" })).toBe("ankur@gndec.ac.in");
  });

  it("ignores blank or non-text names", () => {
    expect(displayName({ email: "a@b.in", user_metadata: { full_name: "  ", name: 42 } })).toBe("a@b.in");
  });

  it("has something to show with no email either", () => {
    expect(displayName({})).toBe("Signed in");
  });
});

describe("initials", () => {
  it("takes the first letters of the first two words", () => {
    expect(initials("Ankur Paul")).toBe("AP");
    expect(initials("dr. meera  iyer")).toBe("DM");
    expect(initials("Ankur")).toBe("A");
  });

  it("takes one letter of an email", () => {
    expect(initials("ankur@gndec.ac.in")).toBe("A");
  });
});

describe("avatarUrl", () => {
  it("returns Google's picture or nothing", () => {
    expect(avatarUrl({ user_metadata: { avatar_url: "https://x/p.png" } })).toBe("https://x/p.png");
    expect(avatarUrl({ user_metadata: { avatar_url: "" } })).toBeUndefined();
    expect(avatarUrl({})).toBeUndefined();
  });
});

describe("redirectUrl", () => {
  it("comes from the current origin, whatever the port", () => {
    expect(redirectUrl({ origin: "http://localhost:5173" })).toBe("http://localhost:5173/");
    expect(redirectUrl({ origin: "http://localhost:5174" })).toBe("http://localhost:5174/");
    expect(redirectUrl({ origin: "https://timetable.example.com" })).toBe("https://timetable.example.com/");
  });
});

describe("looksLikeEmail", () => {
  it("accepts address-shaped text, trimmed", () => {
    expect(looksLikeEmail("ankur@gndec.ac.in")).toBe(true);
    expect(looksLikeEmail("  ankur@gndec.ac.in ")).toBe(true);
  });

  it("rejects the rest", () => {
    for (const text of ["", "ankur", "ankur@", "ankur@gndec", "a b@c.in", "@gndec.ac.in"]) expect(looksLikeEmail(text)).toBe(false);
  });
});

describe("authErrorMessage", () => {
  it("explains an expired or reused link", () => {
    expect(authErrorMessage({ code: "otp_expired", message: "Email link is invalid or has expired" })).toMatch(/expired or was already used/);
  });

  it("explains the email rate limit, by code or by status", () => {
    expect(authErrorMessage({ code: "over_email_send_rate_limit" })).toMatch(/Too many sign-in emails/);
    expect(authErrorMessage({ status: 429, message: "rate limited" })).toMatch(/Too many sign-in emails/);
  });

  it("passes other messages through", () => {
    expect(authErrorMessage({ message: "Signups not allowed" })).toBe("Couldn't sign in: Signups not allowed");
    expect(authErrorMessage({})).toBe("Couldn't sign in. Try again.");
  });
});

describe("withoutAuthError", () => {
  it("drops an error hash", () => {
    expect(withoutAuthError("http://localhost:5173/#error=access_denied&error_code=otp_expired&error_description=Email+link"))
      .toBe("http://localhost:5173/");
  });

  it("drops error query params but keeps the others", () => {
    expect(withoutAuthError("http://localhost:5173/?x=1&error=access_denied&error_description=No")).toBe("http://localhost:5173/?x=1");
  });

  it("leaves a URL without an error alone", () => {
    expect(withoutAuthError("http://localhost:5173/?x=1#section")).toBe("http://localhost:5173/?x=1#section");
  });
});
