import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";

import { Badge } from "./Badge";

afterEach(cleanup);

describe("Badge", () => {
  it("renders content with configurable tone and size", () => {
    render(() => (
      <Badge tone="success" size="compact">
        Ready
      </Badge>
    ));
    const badge = screen.getByText("Ready");
    expect(badge.dataset.tone).toBe("success");
    expect(badge.dataset.size).toBe("compact");
  });

  it("forwards native span properties", () => {
    render(() => <Badge aria-label="Build status">Passing</Badge>);
    expect(screen.getByLabelText("Build status").dataset.tone).toBe("neutral");
  });
});
