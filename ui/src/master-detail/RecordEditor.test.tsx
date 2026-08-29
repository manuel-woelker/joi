import { cleanup, render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { parseQueryResponse } from "../query/query-result";
import { FetchService } from "../services/fetch-service";
import { RecordEditor } from "./RecordEditor";

afterEach(cleanup);

describe("RecordEditor", () => {
  it("retains its draft when saving fails", async () => {
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
        result={result}
        recordId="record-1"
        onClose={() => undefined}
        onSaved={() => undefined}
      />
    ));

    const name = screen.getByRole("textbox", { name: "Name" });
    await userEvent.clear(name);
    await userEvent.type(name, "Unsaved value");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect((await screen.findByRole("alert")).textContent).toContain("HTTP 500");
    expect((name as HTMLInputElement).value).toBe("Unsaved value");
  });
});
