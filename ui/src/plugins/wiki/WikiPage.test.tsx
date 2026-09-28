// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
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
  const fetchService = new FetchService(vi.fn());
  const dataChanges = new DataChangeService();
  const onClose = vi.fn();
  const result = parseQueryResponse({
    number_of_hits: 1,
    result_columns: [
      { attribute: "id", values: { type: "string", values: ["page-1"] } },
      { attribute: "title", values: { type: "string", values: ["Installation"] } },
      {
        attribute: "content",
        values: { type: "string", values: ["<p><strong>First</strong> steps</p><script>alert(1)</script>"] },
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
  return { result, onClose };
}

it("shows a safe document without attribute labels and enters edit mode explicitly", async () => {
  mount();
  expect(screen.getByRole("heading", { name: "Installation" })).toBeTruthy();
  expect(screen.getByText("First", { exact: false }).closest("strong")).toBeTruthy();
  expect(document.querySelector("script")).toBeNull();
  expect(screen.queryByRole("textbox")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Edit page" }));
  expect(window.location.hash).toContain("edit");
  expect(screen.getByRole("textbox", { name: "Title" })).toBeTruthy();
  expect(await screen.findByRole("textbox", { name: "Content" })).toBeTruthy();
  expect(screen.queryByText("Content")).toBeNull();
  expect(screen.queryByRole("tab", { name: "Details" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Close details" })).toBeNull();
  expect(screen.queryByRole("heading", { name: "Installation" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "View page" }));
  expect(window.location.hash).not.toContain("edit");
  expect(screen.queryByRole("textbox")).toBeNull();
});

it("restores edit mode from the hash on load", () => {
  mount(true);
  expect(screen.getByRole("textbox", { name: "Title" })).toBeTruthy();
});
