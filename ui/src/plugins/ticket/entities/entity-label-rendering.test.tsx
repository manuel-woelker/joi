// @vitest-environment happy-dom

import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, it } from "vitest";
import { PluginRegistryBuilder, plugin } from "../../../base/plugin-registry";
import { FetchService, fetchServiceKey } from "../../../base/services/fetch-service";
import { DataTable } from "../../../components/DataTable";
import { administrationContributions } from "../../core/administration/contribution";
import { userEntity } from "../../core/administration/users/user-entity";
import usersLookupPlugin from "../../core/administration/users/users-lookup.plugin";
import { bindEntity, createEntityTableColumns } from "../../core/entities/bound-entity";
import type { EntityDescription } from "../../core/entities/entity-description";
import { createEntityEditorDefinition } from "../../core/entities/entity-editor";
import { entityDescriptions } from "../../core/entities/entity-registry";
import { LookupProvider, lookupDefinitions } from "../../core/lookups/lookup";
import { RecordEditor } from "../../core/master-detail/RecordEditor";
import { parseQueryResponse } from "../../core/query/query-result";
import { projectEntity } from "../projects/project-entity";
import projectsPlugin from "../projects/projects.plugin";
import { ticketEntity } from "./ticket-entity";

afterEach(cleanup);

const records: Record<string, Record<string, string>> = {
  users: { id: "user-1", name: "Jane Developer", username: "jane" },
  projects: { id: "project-1", name: "Test (internal)", prefix: "TEST", description: "Test project" },
  tickets: {
    id: "ticket-1",
    key: "TEST-1",
    title: "Fix rendering",
    project_id: "project-1",
    assignee: "user-1",
    status: "open",
    description: "A test ticket",
  },
};

function columns(description: EntityDescription) {
  return description.attributes.map((attribute) => ({
    attribute: attribute.id,
    values: { type: "string", values: [records[description.tableName][attribute.id] ?? ""] },
  }));
}

function setup() {
  const fetchService = new FetchService(async (_input, init) => {
    const { table_name } = JSON.parse(String(init?.body));
    const description = [userEntity, projectEntity].find((entity) => entity.tableName === table_name);
    if (!description) throw new Error(`Unexpected query: ${table_name}`);
    return {
      ok: true,
      json: async () => ({ results: [{ type: "rows", result_columns: columns(description) }] }),
    } as Response;
  });
  const registry = new PluginRegistryBuilder([{ key: fetchServiceKey, value: fetchService }])
    .register(
      plugin({
        name: "test-points",
        description: "Entity rendering test extension points",
        registerExtensionPoints(context) {
          context.registerExtensionPoint({ point: lookupDefinitions });
          context.registerExtensionPoint({ point: entityDescriptions });
          context.registerExtensionPoint({ point: administrationContributions });
        },
      }),
    )
    .register(usersLookupPlugin)
    .register(projectsPlugin)
    .build();
  return { registry, fetchService };
}

it("renders reference table cells using the referenced entity's compiled label", async () => {
  const { registry } = setup();
  const result = parseQueryResponse({ number_of_hits: 1, result_columns: columns(ticketEntity) });
  const bound = bindEntity(result, ticketEntity);
  render(() => (
    <LookupProvider registry={registry}>
      <DataTable result={result} columns={createEntityTableColumns(bound)} ariaLabel="Tickets" />
    </LookupProvider>
  ));
  expect(await screen.findByRole("cell", { name: "Jane Developer (jane)" })).toBeTruthy();
  expect(await screen.findByRole("cell", { name: "Test (internal)" })).toBeTruthy();
  expect(screen.queryByRole("cell", { name: "user-1" })).toBeNull();
  expect(screen.queryByRole("cell", { name: "project-1" })).toBeNull();
});

it.each([
  [ticketEntity, "TEST-1: Fix rendering"],
  [userEntity, "Jane Developer (jane)"],
  [projectEntity, "Test (internal)"],
] as const)("renders the %s detail heading from its compiled label", (description, heading) => {
  const { registry, fetchService } = setup();
  const result = parseQueryResponse({ number_of_hits: 1, result_columns: columns(description) });
  render(() => (
    <LookupProvider registry={registry}>
      <RecordEditor
        definition={createEntityEditorDefinition(description)}
        fetchService={fetchService}
        mode={{ type: "edit", result, recordId: records[description.tableName].id }}
        onClose={() => undefined}
      />
    </LookupProvider>
  ));
  expect(screen.getByRole("heading", { name: heading })).toBeTruthy();
});
