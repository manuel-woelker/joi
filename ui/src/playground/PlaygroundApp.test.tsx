import { cleanup, render, screen, waitFor } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { PlaygroundDemo } from "./demo";
import { PlaygroundApp } from "./PlaygroundApp";
import { playgroundHash } from "./playground-route";

const library: readonly PlaygroundDemo[] = [
  {
    id: "./Badge.demo.tsx",
    sourcePath: "./Badge.demo.tsx",
    name: "Badge",
    description: "Compact labels",
    scenarios: [
      { name: "Default", description: "Neutral badge", render: () => <span>Default preview</span> },
      { name: "Tones", render: () => <span>Tones preview</span> },
    ],
  },
];

beforeEach(() => {
  window.location.hash = "#playground";
});
afterEach(cleanup);

describe("PlaygroundApp", () => {
  it("canonicalizes bare routes and renders every scenario", async () => {
    render(() => <PlaygroundApp library={library} />);
    expect(screen.getByRole("heading", { name: "Badge", level: 1 })).toBeTruthy();
    expect(screen.getByText("Default preview")).toBeTruthy();
    expect(screen.getByText("Tones preview")).toBeTruthy();
    await waitFor(() => expect(window.location.hash).toBe(playgroundHash(library[0].id, "Default")));
  });

  it("updates selected scenarios through hash navigation", async () => {
    render(() => <PlaygroundApp library={library} />);
    await userEvent.click(screen.getByRole("link", { name: "Tones" }));
    await waitFor(() => expect(window.location.hash).toBe(playgroundHash(library[0].id, "Tones")));
    await waitFor(() => expect(screen.getByRole("link", { name: "Tones" }).getAttribute("aria-current")).toBe("page"));
  });

  it("shows a useful empty state", () => {
    render(() => <PlaygroundApp library={[]} />);
    expect(screen.getByRole("heading", { name: "No component demos" })).toBeTruthy();
    expect(screen.getByText(/\.demo\.tsx/)).toBeTruthy();
  });
});
