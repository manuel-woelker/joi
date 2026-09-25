// @vitest-environment happy-dom

import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";

import { DataText, FilterText, ModelText } from "./SourceText";

afterEach(cleanup);

describe("source text components", () => {
  it("renders each source as a styled span with children only", () => {
    render(() => (
      <div>
        <DataText>Data</DataText>
        <ModelText>Model</ModelText>
        <FilterText>Filter</FilterText>
      </div>
    ));
    for (const [label, source] of [
      ["Data", "data"],
      ["Model", "model"],
      ["Filter", "filter"],
    ]) {
      const text = screen.getByText(label);
      expect(text.tagName).toBe("SPAN");
      expect(text.className).toContain(source);
      expect(text.attributes).toHaveLength(1);
    }
  });
});
