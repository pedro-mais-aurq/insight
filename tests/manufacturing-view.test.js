import { describe, expect, it } from "vitest";
import { MANUFACTURING_ERROR_CODES } from "../src/manufacturing/manufacturing-errors.js";
import {
  createManufacturingView,
  formatDuration,
  formatWeight,
  MANUFACTURING_FALLBACK_MESSAGE
} from "../src/manufacturing/manufacturing-view.js";

describe("manufacturing view", () => {
  it("formata tempo e peso para apresentação", () => {
    expect(formatDuration(93784)).toBe("1 d 2 h 4 min");
    expect(formatWeight(63.51)).toContain("63,51");
  });

  it("exibe uma única mensagem comercial para toda falha terminal", () => {
    const elements = Object.fromEntries([
      "quantity", "weight", "time", "profile", "status", "retry"
    ].map((name) => [name, { value: "1", hidden: false, textContent: "", addEventListener() {} }]));
    const selectors = {
      "[data-manufacturing-quantity]": elements.quantity,
      "[data-manufacturing-weight]": elements.weight,
      "[data-manufacturing-time]": elements.time,
      "[data-manufacturing-profile]": elements.profile,
      "[data-manufacturing-status]": elements.status,
      "[data-manufacturing-retry]": elements.retry
    };
    const root = { dataset: {}, querySelector: (selector) => selectors[selector] };
    const view = createManufacturingView(root);
    for (const code of Object.values(MANUFACTURING_ERROR_CODES)) {
      view.showError(code);
      expect(elements.status.textContent).toBe(MANUFACTURING_FALLBACK_MESSAGE);
    }
    expect(MANUFACTURING_FALLBACK_MESSAGE).toBe("não conseguimos estipular os valores mínimos, favor consultar a insight no whatsapp");
  });
});
