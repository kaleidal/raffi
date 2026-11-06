import { describe, expect, test } from "bun:test";
import { deviceSignInState } from "../src/traktDevice";

describe("Trakt device sign-in", () => {
  test("keeps waiting until Trakt says the code is finished", () => {
    expect(deviceSignInState(400)).toBe("pending");
    expect(deviceSignInState(429)).toBe("slow-down");
  });

  test("stops when the code is used up, expired or refused", () => {
    expect([404, 409, 410].map(deviceSignInState)).toEqual(["expired", "expired", "expired"]);
    expect(deviceSignInState(418)).toBe("denied");
  });

  test("doesn't treat a Trakt outage as waiting", () => {
    expect(deviceSignInState(500)).toBeUndefined();
  });
});
