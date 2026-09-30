// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { createSignal } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApplication } from "../../base/application-registry";
import { FetchService } from "../../base/services/fetch-service";
import { LinkService } from "../../plugins/core/links/link-service";

import { RichTextEditor } from "./RichTextEditor";
import type { LinkPickerSource } from "./link-picker";

afterEach(cleanup);

describe("RichTextEditor", () => {
  it("renders HTML through an implementation-independent accessible surface", async () => {
    render(() => <RichTextEditor ariaLabel="Issue description" value="<p><strong>Important</strong> text</p>" />);

    const document = await screen.findByRole("textbox", { name: "Issue description" });
    expect(document.innerHTML).toContain("<strong>Important</strong>");
    expect(screen.getByRole("toolbar", { name: "Text formatting" })).toBeTruthy();
  });

  it("preserves editable wiki links in stored HTML", async () => {
    render(() => <RichTextEditor ariaLabel="Wiki content" value={'<p><a href="#:wiki:Start">Start</a></p>'} />);

    const document = await screen.findByRole("textbox", { name: "Wiki content" });
    await waitFor(() => expect(document.querySelector("a")?.getAttribute("href")).toBe("#:wiki:Start"));
    expect(screen.getByRole("button", { name: "Link" })).toBeTruthy();
  });

  it("synchronizes externally supplied HTML", async () => {
    const [html, setHtml] = createSignal("<p>First version</p>");
    render(() => <RichTextEditor ariaLabel="Description" value={html()} onChange={setHtml} />);

    const document = await screen.findByRole("textbox", { name: "Description" });
    await userEvent.click(document);
    await userEvent.type(document, " edited");
    await waitFor(() => expect(html()).toContain("edited"));

    setHtml("<h2>Updated externally</h2>");
    await waitFor(() => expect(document.innerHTML).toContain("<h2>Updated externally</h2>"));
  });

  it("hides editing controls when read only", async () => {
    render(() => <RichTextEditor ariaLabel="Published description" value="<p>Published</p>" readOnly />);

    await screen.findByText("Published");
    expect(screen.queryByRole("toolbar")).toBeNull();
  });

  it("configures available heading levels", async () => {
    render(() => <RichTextEditor ariaLabel="Structured document" value="<p>Text</p>" headingLevels={[2, 4]} />);

    const headings = await screen.findByRole("combobox", { name: "Heading level" });
    expect(Array.from((headings as HTMLSelectElement).options).map((option) => option.textContent)).toEqual([
      "Heading",
      "Heading 2",
      "Heading 4",
    ]);
  });

  it("can disable headings without removing paragraph formatting", async () => {
    render(() => <RichTextEditor ariaLabel="Plain document" value="<p>Text</p>" headingLevels={false} />);

    await screen.findByRole("textbox", { name: "Plain document" });
    expect(screen.queryByRole("combobox", { name: "Heading level" })).toBeNull();
    expect(screen.getByRole("button", { name: "Paragraph" })).toBeTruthy();
  });

  it("inserts a selected internal target as one link mark", async () => {
    const [html, setHtml] = createSignal("<p>See </p>");
    const links: LinkPickerSource = {
      search: async () => ({
        entries: [{ reference: "wiki:Start", label: "Start", href: "#:wiki:Start" }],
        errors: [],
      }),
      resolve: async () => [],
    };
    render(() => <RichTextEditor ariaLabel="Wiki content" value={html()} onChange={setHtml} links={links} />);
    await screen.findByRole("textbox", { name: "Wiki content" });
    await userEvent.click(screen.getByRole("button", { name: "Link to entity" }));
    const input = await screen.findByRole("textbox", { name: "Search link targets" });
    await userEvent.type(input, "Start");
    await waitFor(() => expect(screen.getByRole("option", { name: /Start/ })).toBeTruthy());
    await userEvent.click(screen.getByRole("option", { name: /Start/ }));
    await waitFor(() => expect(html()).toContain('data-joi-ref="wiki:Start"'));
    expect(html()).toContain('href="#:wiki:Start"');
  });

  it("leaves the loading state after opening an empty picker", async () => {
    const links: LinkPickerSource = {
      search: async () => ({ entries: [], errors: [] }),
      resolve: async () => [],
    };
    render(() => <RichTextEditor ariaLabel="Wiki content" value="<p></p>" links={links} />);
    await screen.findByRole("textbox", { name: "Wiki content" });
    await userEvent.click(screen.getByRole("button", { name: "Link to entity" }));
    expect(screen.getByText("Type to search")).toBeTruthy();
    expect(screen.queryByText("Searching...")).toBeNull();
  });

  it("settles an empty picker with the discovered application providers", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const fetcher = vi.fn(async () => {
      throw new Error("Unexpected fetch");
    });
    const application = createApplication({ fetchService: new FetchService(fetcher) });
    const links = new LinkService(application.registry);
    render(() => <RichTextEditor ariaLabel="Wiki content" value="<p></p>" links={links} />);
    await screen.findByRole("textbox", { name: "Wiki content" });
    await userEvent.click(screen.getByRole("button", { name: "Link to entity" }));
    await waitFor(() => expect(screen.getByText("Type to search")).toBeTruthy());
    expect(fetcher).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Search link targets" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Search link targets" }), "Start");
    await waitFor(() => expect(fetcher).toHaveBeenCalled());
  });

  it("shows partial target results while another provider is still searching", async () => {
    const links: LinkPickerSource = {
      search: async (_query, _signal, onUpdate) => {
        onUpdate?.({ entries: [{ reference: "wiki:Start", label: "Start", href: "#:wiki:Start" }], errors: [] });
        return new Promise(() => undefined);
      },
      resolve: async () => [],
    };
    render(() => <RichTextEditor ariaLabel="Wiki content" value="<p></p>" links={links} />);
    await screen.findByRole("textbox", { name: "Wiki content" });
    await userEvent.click(screen.getByRole("button", { name: "Link to entity" }));
    await userEvent.type(await screen.findByRole("textbox", { name: "Search link targets" }), "Start");
    await waitFor(() => expect(screen.getByRole("option", { name: /Start/ })).toBeTruthy());
    expect(screen.getByText("Searching...")).toBeTruthy();
  });

  it("converts a typed shortcut and leaves missing references readable", async () => {
    const [html, setHtml] = createSignal("<p></p>");
    const links: LinkPickerSource = {
      search: async () => ({ entries: [], errors: [] }),
      resolve: async (references) =>
        references.map((reference) =>
          reference === "wiki:Start" ? { reference, label: "Start", href: "#:wiki:Start" } : undefined,
        ),
    };
    render(() => <RichTextEditor ariaLabel="Shortcuts" value={html()} onChange={setHtml} links={links} />);
    const input = await screen.findByRole("textbox", { name: "Shortcuts" });
    await userEvent.type(input, "[[[[wiki:Start]]]]");
    await waitFor(() => expect(html()).toContain('data-joi-ref="wiki:Start"'));
    await userEvent.type(input, " [[[[wiki:Missing]]]]");
    await waitFor(() => expect(html()).toContain("[[wiki:Missing]]"));
  });
});
