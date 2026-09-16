// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { createSignal } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";

import { RichTextEditor } from "./RichTextEditor";

afterEach(cleanup);

describe("RichTextEditor", () => {
  it("renders HTML through an implementation-independent accessible surface", async () => {
    render(() => <RichTextEditor ariaLabel="Issue description" value="<p><strong>Important</strong> text</p>" />);

    const document = await screen.findByRole("textbox", { name: "Issue description" });
    expect(document.innerHTML).toContain("<strong>Important</strong>");
    expect(screen.getByRole("toolbar", { name: "Text formatting" })).toBeTruthy();
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
});
