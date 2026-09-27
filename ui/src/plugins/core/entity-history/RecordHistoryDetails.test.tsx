// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { onCleanup } from "solid-js";
import { FetchService } from "../../../base/services/fetch-service";
import { DataChangeService } from "../data-changes/data-change-service";
import { EntityHistoryProvider } from "./entity-history-context";
import { EntityHistoryService } from "./entity-history-service";
import { RecordHistoryDetails } from "./RecordHistoryDetails";

afterEach(cleanup);
it("opens history lazily while keeping the record editor draft and lifecycle intact", async () => {
  const requests: string[] = [];
  const service = new EntityHistoryService(
    new FetchService(async (input) => {
      const path = String(input);
      requests.push(path);
      return {
        ok: true,
        json: async () =>
          path.endsWith("model-info")
            ? { models: [{ name: "tickets", history: true, attributes: [], presentation: null }] }
            : { enabled: true, entries: [], next_cursor: null },
      } as Response;
    }),
  );
  const unmounted = vi.fn();
  const close = vi.fn();
  function Draft() {
    onCleanup(unmounted);
    return <input aria-label="Pending title" />;
  }
  render(() => (
    <EntityHistoryProvider service={service}>
      <RecordHistoryDetails
        definition={{ tableName: "tickets", identityAttribute: "id", detailTitle: "Ticket", fields: [] }}
        recordId="t"
        dataChanges={new DataChangeService()}
        onClose={close}
        heading={<h2>TEST-1: Fix rendering</h2>}
      >
        <Draft />
      </RecordHistoryDetails>
    </EntityHistoryProvider>
  ));
  const user = userEvent.setup();
  const input = screen.getByLabelText<HTMLInputElement>("Pending title");
  await user.type(input, "Unsaved edit");
  const history = await screen.findByRole("tab", { name: "History" });
  const heading = screen.getByRole("heading", { name: "TEST-1: Fix rendering" });
  expect(heading.compareDocumentPosition(screen.getByRole("tablist")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(heading.closest('[role="tabpanel"]')).toBeNull();
  const closeButton = screen.getByRole("button", { name: "Close details" });
  expect(closeButton.closest('[role="tabpanel"]')).toBeNull();
  expect(closeButton.closest('[role="tablist"]')).toBeNull();
  expect(screen.getByRole("tablist").parentElement?.contains(closeButton)).toBe(true);
  expect(requests.filter((path) => path.endsWith("entity-history"))).toHaveLength(0);
  await user.click(history);
  expect(screen.getByRole("heading", { name: "TEST-1: Fix rendering" })).toBe(heading);
  expect(screen.getAllByRole("button", { name: "Close details" })).toHaveLength(1);
  await user.click(closeButton);
  expect(close).toHaveBeenCalledOnce();
  await waitFor(() => expect(requests.filter((path) => path.endsWith("entity-history"))).toHaveLength(1));
  expect(unmounted).not.toHaveBeenCalled();
  await user.click(screen.getByRole("tab", { name: "Details" }));
  expect(screen.getByLabelText("Pending title")).toBe(input);
  expect(input.value).toBe("Unsaved edit");
  expect(unmounted).not.toHaveBeenCalled();
});
