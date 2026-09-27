import { describe, expect, it, vi } from "vitest";
import { FetchService } from "../../../base/services/fetch-service";
import { validate } from "../../../validation/validation";
import { userEntity } from "../administration/users/user-entity.fixture";
import { userEntityId } from "../administration/users/user-entity";
import { EntityHistoryService } from "../entity-history/entity-history-service";
import { createEntityEditorDefinition } from "./entity-editor";
import { entityLabel } from "./entity-label";
import { modelFixture, modelWireFixture } from "./model-fixtures";
import { decodeEntity, ModelService, modelServiceFor } from "./model-service";

describe("ModelService", () => {
  it("shares one request and one compilation across readers and history", async () => {
    const fetcher = vi.fn(
      async () => ({ ok: true, json: async () => ({ models: [modelWireFixture(userEntity)] }) }) as Response,
    );
    const fetchService = new FetchService(fetcher);
    const service = modelServiceFor(fetchService);
    expect(modelServiceFor(fetchService)).toBe(service);
    expect(() => service.require(userEntityId)).toThrow("has not loaded");
    const [first, second] = await Promise.all([
      service.load(),
      service.load(),
      service.info(),
      new EntityHistoryService(fetchService).enabled("users"),
    ]);
    expect(first).toBe(second);
    expect(service.require(userEntityId)).toBe(first.require(userEntityId));
    expect(fetcher).toHaveBeenCalledOnce();
    expect(entityLabel(service.require(userEntityId), (key) => (key === "name" ? "Jane" : "jane"))).toBe("Jane (jane)");
    const create = createEntityEditorDefinition(service.require(userEntityId)).create!;
    expect(create.fields.map((field) => field.attribute)).toEqual(["username", "name"]);
    expect(create.attributes[0].initialValue()).toMatch(/^[a-zA-Z0-9]{27}$/);
    expect(typeof service.require(userEntityId).icon).toBe("function");
  });

  it("retries a failed request without caching the failure", async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({ ok: true, json: async () => ({ models: [modelWireFixture(userEntity)] }) });
    const service = new ModelService(new FetchService(fetcher));
    await expect(service.load()).rejects.toThrow("offline");
    await expect(service.load()).resolves.toBeDefined();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("interprets server rules using the existing validation API", () => {
    const model = modelFixture(userEntity);
    const entity = decodeEntity({
      ...model,
      presentation: {
        ...model.presentation!,
        fields: model.presentation!.fields.map((field) =>
          field.attribute === "name"
            ? {
                ...field,
                validation: [
                  { kind: "required", pattern: null, message: "Name required" },
                  { kind: "regex", pattern: "^[\\p{L} .'-]+$", message: "Invalid name" },
                ],
              }
            : field,
        ),
      },
    });
    const name = entity.attributes.find((attribute) => attribute.id === "name")!;
    if (name.valueType !== "string") throw new Error("Expected string");
    expect(validate("José", name.validation!).failures).toEqual([]);
    expect(validate("", name.validation!).failures.map((failure) => failure.message)).toEqual(["Name required"]);
    expect(validate("Joe 123", name.validation!).failures.map((failure) => failure.message)).toEqual(["Invalid name"]);
    expect(name.edit?.required).toBe(true);
  });

  it("rejects invalid server templates and incomplete presentations", () => {
    const model = modelFixture(userEntity);
    expect(() =>
      decodeEntity({ ...model, presentation: { ...model.presentation!, labelTemplate: "${missing}" } }),
    ).toThrow("missing");
    expect(() => decodeEntity({ ...model, presentation: { ...model.presentation!, fields: [] } })).toThrow(
      "Incomplete",
    );
  });
});
