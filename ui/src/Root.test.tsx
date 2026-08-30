import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./App", () => ({ default: () => <main>Workspace application</main> }));

import { Root } from "./Root";

afterEach(cleanup);

describe("Root", () => {
  it("switches between playground and workspace hashes", () => {
    window.location.hash = "#playground";
    render(() => <Root />);
    expect(screen.getByText("Component playground")).toBeTruthy();

    window.location.hash = "#/views/view-active";
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    expect(screen.getByText("Workspace application")).toBeTruthy();
    expect(screen.queryByText("Component playground")).toBeNull();
  });
});
