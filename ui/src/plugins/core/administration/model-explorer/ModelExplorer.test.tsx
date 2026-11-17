// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from "@solidjs/testing-library";
import { afterEach, expect, it } from "vitest";

import { FetchService } from "../../../../base/services/fetch-service";
import { ModelExplorer } from "./ModelExplorer";

afterEach(cleanup);

it("shows embedded domain definitions without treating them as storage tables", async () => {
  const service = new FetchService(
    async () =>
      ({
        ok: true,
        json: async () => ({
          models: [],
          domain_models: [
            {
              id: "grades.Student",
              domain: "grades",
              name: "Student",
              description: "A person enrolled in classes.",
              attributes: [{ name: "Date of Birth", description: "The student's date of birth.", data_type: "date" }],
            },
          ],
        }),
      }) as Response,
  );
  render(() => <ModelExplorer fetchService={service} />);

  fireEvent.click(await screen.findByRole("button", { name: /Student/ }));
  expect(screen.getByText("grades domain")).toBeTruthy();
  expect(screen.getByText("A person enrolled in classes.")).toBeTruthy();
  expect(screen.getByText("Date of Birth")).toBeTruthy();
  expect(screen.getByText("date")).toBeTruthy();
});

it("groups models by domain and preserves selection when switching to name order", async () => {
  const service = new FetchService(
    async () =>
      ({
        ok: true,
        json: async () => ({
          models: [
            { name: "users", domain: null, history: false, presentation: null, attributes: [] },
            { name: "tickets", domain: "tickets", history: false, presentation: null, attributes: [] },
            { name: "repositories", domain: "codevette", history: false, presentation: null, attributes: [] },
          ],
          domain_models: [
            { id: "wiki.Page", domain: "wiki", name: "Page", description: "", attributes: [] },
            { id: "grades.Student", domain: "grades", name: "Student", description: "", attributes: [] },
          ],
        }),
      }) as Response,
  );
  render(() => <ModelExplorer fetchService={service} />);

  const navigation = await screen.findByRole("navigation", { name: "Model types" });
  expect(
    within(navigation)
      .getAllByRole("heading", { level: 3 })
      .map((heading) => heading.textContent),
  ).toEqual(["Storage", "codevette", "grades", "tickets", "wiki"]);
  fireEvent.click(within(navigation).getByRole("button", { name: /Student/ }));
  fireEvent.click(within(navigation).getByRole("button", { name: "Name" }));

  expect(within(navigation).queryAllByRole("heading", { level: 3 })).toHaveLength(0);
  expect(within(navigation).getByRole("button", { name: "Name" }).getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByRole("heading", { name: "Student", level: 2 })).toBeTruthy();
  fireEvent.click(within(navigation).getByRole("button", { name: "Domain" }));
  expect(within(navigation).getAllByRole("heading", { level: 3 })).toHaveLength(5);
  expect(screen.getByRole("heading", { name: "Student", level: 2 })).toBeTruthy();
});
