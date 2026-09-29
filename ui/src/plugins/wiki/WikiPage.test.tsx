// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { afterEach, expect, it, vi } from "vitest";
import { createNavigationController, NavigationProvider } from "../../base/navigation";
import { ApplicationServicesProvider } from "../../base/services/application-services";
import { FetchService } from "../../base/services/fetch-service";
import { DataChangeService } from "../core/data-changes/data-change-service";
import { RecordMutationService } from "../core/data-changes/record-mutation-service";
import { defineEntity } from "../core/entities/entity-description";
import { parseQueryResponse } from "../core/query/query-result";
import { WikiPage } from "./WikiPage";
import { wikiPageEntityId } from "./wikipage-entity";

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

const entity = defineEntity({
  id: wikiPageEntityId,
  tableName: "wikipages",
  label: "Wiki page",
  pluralLabel: "Wiki pages",
  icon: () => null,
  identityAttribute: "id",
  attributes: [
    { id: "id", label: "ID", valueType: "string", generated: true },
    { id: "title", label: "Title", valueType: "string", edit: { control: "text" } },
    { id: "content", label: "Content", valueType: "string", edit: { control: "html" } },
  ],
});

function mount(edit = false) {
  window.history.replaceState(null, "", `/#/entity?entity=wikipage%3Apage-1${edit ? "&edit" : ""}`);
  const published = { title: "Installation", content: "<p><strong>First</strong> steps</p><script>alert(1)</script>" };
  let draft: typeof published | undefined;
  const requests: string[] = [];
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    requests.push(path);
    const body = JSON.parse(String(init?.body ?? "{}"));
    let response: unknown;
    if (path === "/api/wiki-draft") {
      if (body.create && !draft) draft = { ...published };
      response = { exists: !!draft, id: "page-1", title: draft?.title ?? "", content: draft?.content ?? "" };
    } else if (path === "/api/mutate") {
      expect(body.steps[0].update.table_name).toBe("wikipage_drafts");
      expect(draft).toBeDefined();
      for (const column of body.steps[0].update.columns) {
        (draft as Record<string, string>)[column.attribute] = column.values.values[0];
      }
      response = { entities: [{ table_name: "wikipage_drafts", id: "page-1", values: { ...draft } }] };
    } else if (path === "/api/wiki-publish") {
      expect(draft).toBeDefined();
      Object.assign(published, draft);
      draft = undefined;
      response = { ...published };
    } else {
      throw new Error(`Unexpected request: ${path}`);
    }
    return { ok: true, json: async () => response } as Response;
  });
  const fetchService = new FetchService(fetcher);
  const dataChanges = new DataChangeService();
  const onClose = vi.fn();
  const result = parseQueryResponse({
    number_of_hits: 1,
    result_columns: [
      { attribute: "id", values: { type: "string", values: ["page-1"] } },
      { attribute: "title", values: { type: "string", values: [published.title] } },
      {
        attribute: "content",
        values: { type: "string", values: [published.content] },
      },
    ],
  });
  render(() => (
    <NavigationProvider controller={createNavigationController()}>
      <ApplicationServicesProvider
        services={{ fetchService, dataChanges, recordMutations: new RecordMutationService(fetchService, dataChanges) }}
      >
        <WikiPage entity={entity} result={result} recordId="page-1" onClose={onClose} />
      </ApplicationServicesProvider>
    </NavigationProvider>
  ));
  return { result, onClose, published, requests, getDraft: () => draft };
}

it("shows a safe document without attribute labels and enters edit mode explicitly", async () => {
  mount();
  expect(await screen.findByRole("heading", { name: "Installation" })).toBeTruthy();
  expect(screen.getByText("First", { exact: false }).closest("strong")).toBeTruthy();
  expect(document.querySelector("script")).toBeNull();
  expect(screen.queryByRole("textbox")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Edit page" }));
  expect(window.location.hash).toContain("edit");
  expect(await screen.findByRole("textbox", { name: "Title" })).toBeTruthy();
  expect(await screen.findByRole("textbox", { name: "Content" })).toBeTruthy();
  expect(screen.queryByText("Content")).toBeNull();
  expect(screen.queryByRole("tab", { name: "Details" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Close details" })).toBeNull();
  expect(screen.queryByRole("heading", { name: "Installation" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "View page" }));
  expect(window.location.hash).not.toContain("edit");
  expect(screen.queryByRole("textbox")).toBeNull();
});

it("restores edit mode from the hash on load", async () => {
  mount(true);
  expect(await screen.findByRole("textbox", { name: "Title" })).toBeTruthy();
});

it("keeps autosaved changes in a draft and reopens it later", async () => {
  const state = mount();
  await screen.findByRole("heading", { name: "Installation" });
  fireEvent.click(screen.getByRole("button", { name: "Edit page" }));
  const title = (await screen.findByRole("textbox", { name: "Title" })) as HTMLInputElement;
  fireEvent.input(title, { target: { value: "Draft installation" } });
  fireEvent.click(screen.getByRole("button", { name: "View page" }));
  await waitFor(() => expect(state.getDraft()?.title).toBe("Draft installation"));
  expect(state.published.title).toBe("Installation");
  expect(screen.getByRole("heading", { name: "Installation" })).toBeTruthy();
  expect(await screen.findByText("Unpublished edits")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Edit page" }));
  expect(((await screen.findByRole("textbox", { name: "Title" })) as HTMLInputElement).value).toBe(
    "Draft installation",
  );
});

it("flushes an edit before publishing and then clears the draft", async () => {
  const state = mount(true);
  const title = (await screen.findByRole("textbox", { name: "Title" })) as HTMLInputElement;
  fireEvent.input(title, { target: { value: "Published installation" } });
  fireEvent.click(screen.getByRole("button", { name: "Publish" }));
  await waitFor(() => expect(state.published.title).toBe("Published installation"));
  expect(state.requests.indexOf("/api/mutate")).toBeLessThan(state.requests.indexOf("/api/wiki-publish"));
  expect(state.getDraft()).toBeUndefined();
  expect(await screen.findByRole("heading", { name: "Published installation" })).toBeTruthy();
  expect(screen.queryByText("Unpublished edits")).toBeNull();
});
