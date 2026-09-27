// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, it, vi } from "vitest";
import { FetchService } from "../../../base/services/fetch-service";
import { userEntity } from "../administration/users/user-entity.fixture";
import { userEntityId } from "../administration/users/user-entity";
import { useEntityRegistry } from "./entity-registry";
import { modelWireFixture } from "./model-fixtures";
import { ModelService } from "./model-service";
import { ModelProvider } from "./ModelProvider";

afterEach(cleanup);
it("defers entity consumers and allows retry after a model load failure", async () => {
  const fetcher = vi
    .fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue({ ok: true, json: async () => ({ models: [modelWireFixture(userEntity)] }) });
  const mounted = vi.fn();
  function Consumer() {
    mounted();
    return <h1>{useEntityRegistry().require(userEntityId).pluralLabel}</h1>;
  }
  render(() => (
    <ModelProvider service={new ModelService(new FetchService(fetcher))}>
      <Consumer />
    </ModelProvider>
  ));
  expect(mounted).not.toHaveBeenCalled();
  expect(await screen.findByRole("alert")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByRole("heading", { name: "Users" })).toBeTruthy();
  expect(mounted).toHaveBeenCalledOnce();
});
