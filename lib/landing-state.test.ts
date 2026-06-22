import { describe, expect, it } from "vitest";

import { shouldShowFreshStartAction } from "./landing-state";

describe("landing action state", () => {
  it("hides fresh-start action for first-time sessions", () => {
    expect(shouldShowFreshStartAction({ sessionWasRestored: false })).toBe(false);
  });

  it("shows fresh-start action only when a saved session was restored", () => {
    expect(shouldShowFreshStartAction({ sessionWasRestored: true })).toBe(true);
  });
});
