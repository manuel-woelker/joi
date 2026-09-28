// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, it, vi } from "vitest";
import { createNavigationController, NavigationProvider } from "../../../base/navigation";
import { ApplicationServicesProvider } from "../../../base/services/application-services";
import { FetchService } from "../../../base/services/fetch-service";
import { userEntity } from "../administration/users/user-entity.fixture";
import { DataChangeService } from "../data-changes/data-change-service";
import { RecordMutationService } from "../data-changes/record-mutation-service";
import { EntityRegistry, EntityRegistryProvider } from "../entities/entity-registry";
import type { EntityDisplayContribution } from "./contribution";
import { EntityPage } from "./EntityPage";

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

const response = {
  results: [
    {
      type: "rows",
      result_columns: [
        { attribute: "id", values: { type: "string", values: ["u1"] } },
        { attribute: "name", values: { type: "string", values: ["Jane Developer"] } },
        { attribute: "username", values: { type: "string", values: ["jane"] } },
      ],
    },
  ],
};

function showPage(
  fetcher = vi.fn(async () => ({ ok: true, json: async () => response }) as Response),
  displays: readonly EntityDisplayContribution[] = [],
) {
  const fetchService = new FetchService(fetcher);
  const dataChanges = new DataChangeService();
  window.history.replaceState({ entityReturnUrl: "/#/administration/users" }, "", "/#/entity?entity=users%3Au1");
  render(() => (
    <NavigationProvider controller={createNavigationController()}>
      <ApplicationServicesProvider
        services={{ fetchService, dataChanges, recordMutations: new RecordMutationService(fetchService, dataChanges) }}
      >
        <EntityRegistryProvider registry={new EntityRegistry([userEntity])}>
          <EntityPage reference="users:u1" displays={displays} />
        </EntityRegistryProvider>
      </ApplicationServicesProvider>
    </NavigationProvider>
  ));
  return fetcher;
}

it("uses the shared edit form when no custom display is registered", async () => {
  showPage();
  expect(await screen.findByRole("heading", { name: "Jane Developer (jane)" })).toBeTruthy();
  expect((screen.getByRole("textbox", { name: "Name" }) as HTMLInputElement).value).toBe("Jane Developer");
});

it("selects a custom display by canonical type and supports closing", async () => {
  showPage(undefined, [
    {
      entityType: userEntity.id,
      component: (props) => <button onClick={props.onClose}>Custom {props.recordId}</button>,
    },
  ]);
  fireEvent.click(await screen.findByRole("button", { name: "Custom u1" }));
  expect(window.location.search).toBe("");
  expect(window.location.hash).toBe("#/administration/users");
  expect(screen.queryByRole("textbox")).toBeNull();
});

it("renders failed loads and can retry them", async () => {
  const fetcher = vi
    .fn()
    .mockRejectedValueOnce(new Error("Offline"))
    .mockResolvedValue({ ok: true, json: async () => response });
  showPage(fetcher);
  expect((await screen.findByRole("alert")).textContent).toContain("Offline");
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByRole("heading", { name: "Jane Developer (jane)" })).toBeTruthy();
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("renders missing records without opening an editor", async () => {
  showPage(
    vi.fn(
      async () => ({ ok: true, json: async () => ({ results: [{ type: "rows", result_columns: [] }] }) }) as Response,
    ),
  );
  expect(await screen.findByText("Entity not found.")).toBeTruthy();
  expect(screen.queryByRole("textbox")).toBeNull();
});
