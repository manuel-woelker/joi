import { cleanup, render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { parseQueryResponse } from "../query/query-result";
import { FetchService } from "../services/fetch-service";
import { RecordEditor } from "./RecordEditor";

afterEach(cleanup);

describe("RecordEditor", () => {
  it("creates a record only after explicit valid submission", async () => {
    const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({}) }) as Response);
    const onCreated = vi.fn();
    render(() => (
      <RecordEditor
        definition={{
          tableName: "records",
          identityAttribute: "id",
          detailTitle: "Record details",
          fields: [{ attribute: "name", label: "Name", control: "text" }],
          create: {
            title: "New record",
            attributes: [
              { attribute: "id", valueType: "string", initialValue: () => "record-2" },
              {
                attribute: "name",
                valueType: "string",
                initialValue: () => "",
              },
            ],
            fields: [{ attribute: "name", label: "Name", control: "text", required: true }],
          },
        }}
        fetchService={new FetchService(fetcher)}
        mode={{ type: "create", onCreated }}
        onClose={() => undefined}
      />
    ));

    const name = screen.getByRole("textbox", { name: "Name" });
    await userEvent.type(name, "Created record");
    expect(fetcher).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(fetcher).toHaveBeenCalledOnce();
    expect(onCreated).toHaveBeenCalledWith("record-2");
  });

  it("retains its form value when autosaving fails", async () => {
    const fetcher = vi.fn(async () => ({ ok: false, status: 500 }) as Response);
    const result = parseQueryResponse({
      number_of_hits: 1,
      result_columns: [
        { attribute: "id", values: { type: "string", values: ["record-1"] } },
        { attribute: "name", values: { type: "string", values: ["Before"] } },
      ],
    });
    render(() => (
      <RecordEditor
        definition={{
          tableName: "records",
          identityAttribute: "id",
          detailTitle: "Record details",
          fields: [{ attribute: "name", label: "Name", control: "text" }],
        }}
        fetchService={new FetchService(fetcher)}
        mode={{ type: "edit", result, recordId: "record-1" }}
        onClose={() => undefined}
      />
    ));

    const name = screen.getByRole("textbox", { name: "Name" });
    await userEvent.clear(name);
    await userEvent.type(name, "Unsaved value");
    expect((await screen.findByRole("alert")).textContent).toContain("HTTP 500");
    expect((name as HTMLInputElement).value).toBe("Unsaved value");
  });

  it("does not show saved while a newer edit is dirty", async () => {
    let completeSave: ((response: Response) => void) | undefined;
    const fetcher = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          completeSave = resolve;
        }),
    );
    const result = parseQueryResponse({
      number_of_hits: 1,
      result_columns: [
        { attribute: "id", values: { type: "string", values: ["record-1"] } },
        { attribute: "name", values: { type: "string", values: ["Before"] } },
      ],
    });
    render(() => (
      <RecordEditor
        definition={{
          tableName: "records",
          identityAttribute: "id",
          detailTitle: "Record details",
          fields: [{ attribute: "name", label: "Name", control: "text" }],
        }}
        fetchService={new FetchService(fetcher)}
        mode={{ type: "edit", result, recordId: "record-1" }}
        onClose={() => undefined}
      />
    ));

    const name = screen.getByRole("textbox", { name: "Name" });
    await userEvent.clear(name);
    await userEvent.type(name, "First edit");
    await screen.findByText("Saving");
    await userEvent.type(name, " with newer text");
    completeSave?.({ ok: true, status: 200, json: async () => ({}) } as Response);

    await Promise.resolve();
    expect(screen.queryByText("Saved")).toBeNull();
  });
});
