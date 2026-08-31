import { cleanup, render, screen, waitFor } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Select } from "./Select";

interface Place {
  id: string;
  name: string;
  code: string;
}

const places: Place[] = [
  { id: "de", name: "Germany", code: "DE" },
  { id: "jp", name: "Japan", code: "JP" },
  { id: "nz", name: "New Zealand", code: "NZ" },
];

afterEach(cleanup);

describe("Select", () => {
  it("loads once and filters small data sets locally", async () => {
    const loadEntries = vi.fn(async () => ({ entries: places, total: places.length }));
    render(() => (
      <Select
        ariaLabel="Country"
        value=""
        onChange={() => undefined}
        loadEntries={loadEntries}
        entryId={(entry) => entry.id}
        entryText={(entry) => entry.name}
      />
    ));

    const input = screen.getByRole("combobox", { name: "Country" });
    await waitFor(() => expect(loadEntries).toHaveBeenCalledOnce());
    await userEvent.click(input);
    await userEvent.type(input, "zeal");

    expect(await screen.findByRole("option", { name: "New Zealand" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Germany" })).toBeNull();
    expect(loadEntries).toHaveBeenCalledOnce();
  });

  it("queries large data sets and ignores local filtering", async () => {
    const loadEntries = vi.fn(async (query: string) => ({
      entries: places.filter((place) => place.name.toLowerCase().includes(query.toLowerCase())),
      total: 1000,
    }));
    render(() => (
      <Select
        ariaLabel="Remote country"
        value="jp"
        onChange={() => undefined}
        loadEntries={loadEntries}
        entryId={(entry) => entry.id}
        entryText={(entry) => entry.name}
        debounceMs={0}
      />
    ));

    const input = screen.getByRole("combobox", { name: "Remote country" });
    await waitFor(() => expect(loadEntries).toHaveBeenCalledWith("", "jp"));
    await waitFor(() => expect((input as HTMLInputElement).value).toBe("Japan"));
    await userEvent.click(input);
    await userEvent.type(input, "jap");

    await waitFor(() => expect(loadEntries).toHaveBeenCalledWith("jap"));
    expect(await screen.findByRole("option", { name: "Japan" })).toBeTruthy();
  });

  it("supports custom rendering and keyboard selection", async () => {
    const onChange = vi.fn();
    render(() => (
      <Select
        ariaLabel="Rendered country"
        value=""
        onChange={onChange}
        loadEntries={async () => ({ entries: places, total: places.length })}
        entryId={(entry) => entry.id}
        entryText={(entry) => entry.name}
        renderEntry={(entry) => (
          <>
            <strong>{entry.code}</strong> {entry.name}
          </>
        )}
      />
    ));

    const input = screen.getByRole("combobox", { name: "Rendered country" });
    await userEvent.click(input);
    await screen.findByRole("option", { name: "DE Germany" });
    await userEvent.keyboard("{ArrowDown}{Enter}");

    expect(onChange).toHaveBeenCalledWith("jp");
  });

  it("portals options outside clipping ancestors", async () => {
    render(() => (
      <div data-testid="cropped-parent" style={{ overflow: "hidden", height: "20px" }}>
        <Select
          ariaLabel="Clipped country"
          value=""
          onChange={() => undefined}
          loadEntries={async () => ({ entries: places, total: places.length })}
          entryId={(entry) => entry.id}
          entryText={(entry) => entry.name}
        />
      </div>
    ));

    await userEvent.click(screen.getByRole("combobox", { name: "Clipped country" }));
    const option = await screen.findByRole("option", { name: "Germany" });

    expect(screen.getByTestId("cropped-parent").contains(option)).toBe(false);
    expect(option.closest('[role="listbox"]')).toBeTruthy();
  });
});
