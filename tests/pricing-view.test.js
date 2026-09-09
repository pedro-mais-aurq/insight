import { describe, expect, it } from "vitest";
import {
  UNAVAILABLE_MESSAGE,
  formatCurrency,
  initPricingView
} from "../src/pricing/pricing-view.js";

function fakeRoot() {
  const status = { textContent: "" };
  const price = { textContent: "R$ 00,00", hidden: false };
  return {
    dataset: {},
    querySelector(selector) {
      return selector === "[data-pricing-status]" ? status : price;
    },
    status,
    price
  };
}

describe("pricing view", () => {
  it("inicia neutra sem inventar preço", () => {
    const root = fakeRoot();
    initPricingView(root);

    expect(root.dataset.pricingState).toBe("unavailable");
    expect(root.status.textContent).toBe(UNAVAILABLE_MESSAGE);
    expect(root.price.textContent).toBe("—");
  });

  it("formata uma estimativa pública em BRL", () => {
    const root = fakeRoot();
    const view = initPricingView(root);
    view.showEstimate({ totalPrice: 205.62, quantity: 2, currency: "BRL" });

    expect(root.dataset.pricingState).toBe("ready");
    expect(root.status.textContent).toBe("2 peças");
    expect(root.price.textContent).toBe(formatCurrency(205.62, "BRL"));
  });

  it("usa estado indeterminado enquanto calcula o valor", () => {
    const root = fakeRoot();
    const updates = [];
    const view = initPricingView(root, {
      onStateChange: (event) => updates.push(event.status)
    });
    view.showProcessing();

    expect(root.dataset.pricingState).toBe("processing");
    expect(root.status.textContent).toBe("Calculando o valor…");
    expect(root.price.textContent).toBe("—");
    expect(updates).toEqual(["unavailable", "processing"]);
  });
});
