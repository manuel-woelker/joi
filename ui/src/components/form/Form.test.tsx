import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { Form, useFormField } from "./Form";

afterEach(cleanup);

function TestField() {
  const field = useFormField("name");
  return (
    <>
      <label>
        {field.label}
        <input value={field.value} onInput={field.onInput} />
      </label>
      <output>{field.value}</output>
      <button type="button" onClick={() => field.setValue("Ada")}>
        Set value
      </button>
    </>
  );
}

describe("Form", () => {
  it("provides reactive fields that update on every typed character", async () => {
    render(() => (
      <Form model={{ attributes: [{ id: "name", label: "Name", initialValue: "Elliot" }] }}>
        <TestField />
      </Form>
    ));

    expect((screen.getByRole("textbox", { name: "Name" }) as HTMLInputElement).value).toBe("Elliot");
    await userEvent.type(screen.getByRole("textbox", { name: "Name" }), "!");
    expect(screen.getByText("Elliot!")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Set value" }));
    expect(screen.getByText("Ada")).toBeTruthy();
  });

  it("rejects duplicate field IDs", () => {
    expect(() =>
      render(() => (
        <Form
          model={{
            attributes: [
              { id: "name", label: "First name", initialValue: "" },
              { id: "name", label: "Last name", initialValue: "" },
            ],
          }}
        />
      )),
    ).toThrow("Form field 'name' is defined more than once");
  });

  it("rejects field access outside a form", () => {
    const OrphanField = () => {
      useFormField("name");
      return null;
    };
    expect(() => render(() => <OrphanField />)).toThrow("useFormField must be called inside a Form");
  });

  it("rejects fields missing from the model", () => {
    const MissingField = () => {
      useFormField("missing");
      return null;
    };
    expect(() =>
      render(() => (
        <Form model={{ attributes: [] }}>
          <MissingField />
        </Form>
      )),
    ).toThrow("Form field 'missing' is not defined");
  });
});
