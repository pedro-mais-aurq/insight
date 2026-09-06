import { describe, expect, it } from "vitest";
import { formatDuration, formatWeight } from "../src/manufacturing/manufacturing-view.js";

describe("manufacturing view", () => {
  it("formata tempo e peso para apresentação", () => {
    expect(formatDuration(93784)).toBe("1 d 2 h 4 min");
    expect(formatWeight(63.51)).toContain("63,51");
  });
});
