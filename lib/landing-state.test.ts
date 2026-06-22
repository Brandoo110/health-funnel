import { describe, expect, it } from "vitest";

import {
  getInitialFunnelView,
  isRetentionOfferApplied,
  shouldShowFreshStartAction,
} from "./landing-state";

describe("landing action state", () => {
  it("hides fresh-start action for first-time sessions", () => {
    expect(shouldShowFreshStartAction({ sessionWasRestored: false })).toBe(false);
  });

  it("shows fresh-start action only when a saved session was restored", () => {
    expect(shouldShowFreshStartAction({ sessionWasRestored: true })).toBe(true);
  });

  it("starts in a bootstrapping view so restored result pages do not flash landing", () => {
    expect(getInitialFunnelView()).toBe("bootstrapping");
  });

  it("keeps the claimed retention offer only for the same restored session", () => {
    expect(
      isRetentionOfferApplied({
        sessionId: "session-a",
        claimedSessionId: "session-a",
      }),
    ).toBe(true);

    expect(
      isRetentionOfferApplied({
        sessionId: "session-a",
        claimedSessionId: "session-b",
      }),
    ).toBe(false);

    expect(
      isRetentionOfferApplied({
        sessionId: "session-a",
        claimedSessionId: null,
      }),
    ).toBe(false);
  });
});
