import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Form, useFormField, useFormState, type FormField } from "./Form";
import { FormValidationMessages } from "./FormValidationMessages";
import { notEmpty } from "../../validation/validation-functions";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function TestField() {
  const field = useFormField("name");
  return (
    <>
      <label>
        {field.label}
        <input value={field.value} onInput={field.onInput} onBlur={field.onBlur} />
      </label>
      <output>{field.value}</output>
      <output data-testid="field-touched">{String(field.touched())}</output>
      <button type="button" onClick={() => field.setValue("Ada")}>
        Set value
      </button>
    </>
  );
}

function SaveFields() {
  const name = useFormField("name");
  const role = useFormField("role");
  return (
    <>
      <input aria-label="Name" value={name.value} onInput={name.onInput} />
      <input aria-label="Role" value={role.value} onInput={role.onInput} />
    </>
  );
}

function DirtyIndicator() {
  const form = useFormState();
  return (
    <>
      <output>{form.dirty() ? "Dirty" : "Clean"}</output>
      <button type="button" onClick={form.reset}>
        Reset
      </button>
    </>
  );
}

function ValidatedField() {
  const field = useFormField("name");
  const visibleValidationMessages = () => field.validationMessages().filter((failure) => failure.touched);
  return (
    <div>
      <label for="validated-name">Name</label>
      <input
        id="validated-name"
        value={field.value}
        aria-invalid={visibleValidationMessages().length > 0}
        aria-describedby={visibleValidationMessages().length > 0 ? "validated-name-messages" : undefined}
        onInput={field.onInput}
        onBlur={field.onBlur}
      />
      <FormValidationMessages attribute="name" id="validated-name-messages" />
      <output data-testid="validation-touched">{String(field.validationMessages()[0]?.touched ?? false)}</output>
    </div>
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

  it("exposes readonly fields and rejects their input handler", () => {
    let field: FormField | undefined;
    const ReadonlyField = () => {
      field = useFormField("identifier");
      return <input aria-label="Identifier" value={field.value} readOnly={field.readonly} onInput={field.onInput} />;
    };
    render(() => (
      <Form
        model={{
          attributes: [{ id: "identifier", label: "Identifier", initialValue: "user-2jx4", readonly: true }],
        }}
      >
        <ReadonlyField />
      </Form>
    ));

    expect(field?.readonly).toBe(true);
    expect(screen.getByRole("textbox", { name: "Identifier" }).hasAttribute("readonly")).toBe(true);
    expect(() => field?.onInput({} as Parameters<FormField["onInput"]>[0])).toThrow(
      "Form field 'identifier' is readonly",
    );
  });

  it("exposes a placeholder for empty fields", () => {
    const PlaceholderField = () => {
      const field = useFormField("summary");
      return (
        <input aria-label={field.label} value={field.value} placeholder={field.placeholder} onInput={field.onInput} />
      );
    };
    render(() => (
      <Form
        model={{
          attributes: [{ id: "summary", label: "Summary", initialValue: "", placeholder: "Briefly describe it" }],
        }}
      >
        <PlaceholderField />
      </Form>
    ));

    expect(screen.getByPlaceholderText("Briefly describe it")).toBeTruthy();
  });

  it("displays field validation and saves after the value becomes valid", () => {
    vi.useFakeTimers();
    const onSave = vi.fn();
    const validateName = notEmpty("Name is required.");
    render(() => (
      <Form
        model={{
          attributes: [
            {
              id: "name",
              label: "Name",
              initialValue: "Jane",
              validation(context) {
                validateName(context);
              },
            },
          ],
        }}
        saveDebounceMs={100}
        onSave={onSave}
      >
        <ValidatedField />
      </Form>
    ));

    const input = screen.getByRole("textbox", { name: "Name" });
    fireEvent.input(input, { target: { value: "" } });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByTestId("validation-touched").textContent).toBe("false");
    fireEvent.blur(input);
    expect(screen.getByRole("alert").textContent).toBe("Name is required.");
    expect(screen.getByTestId("validation-touched").textContent).toBe("true");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    vi.advanceTimersByTime(100);
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.input(input, { target: { value: "Janet" } });
    expect(screen.queryByRole("alert")).toBeNull();
    vi.advanceTimersByTime(100);
    expect(onSave).toHaveBeenCalledWith({ name: "Janet" });
  });

  it("resets field values, dirty state, and touched state", () => {
    render(() => (
      <Form model={{ attributes: [{ id: "name", label: "Name", initialValue: "Elliot" }] }}>
        <TestField />
        <DirtyIndicator />
      </Form>
    ));

    const input = screen.getByRole("textbox", { name: "Name" });
    fireEvent.input(input, { target: { value: "Grace" } });
    fireEvent.blur(input);
    expect(screen.getByText("Dirty")).toBeTruthy();
    expect(screen.getByTestId("field-touched").textContent).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect((input as HTMLInputElement).value).toBe("Elliot");
    expect(screen.getByText("Clean")).toBeTruthy();
    expect(screen.getByTestId("field-touched").textContent).toBe("false");
  });

  it("displays attached field and form validation messages", () => {
    render(() => (
      <Form
        model={{
          attributes: [{ id: "name", label: "Name", initialValue: "Jane" }],
          validationMessages: [
            { attribute: "name", message: "That name is already used." },
            { message: "The record cannot be saved." },
          ],
        }}
      >
        <ValidatedField />
        <FormValidationMessages />
      </Form>
    ));

    expect(screen.getByText("That name is already used.")).toBeTruthy();
    expect(screen.getByText("The record cannot be saved.")).toBeTruthy();
  });

  it("debounces and coalesces changed values", () => {
    vi.useFakeTimers();
    const onSave = vi.fn();
    render(() => (
      <Form
        model={{
          attributes: [
            { id: "name", label: "Name", initialValue: "Elliot" },
            { id: "role", label: "Role", initialValue: "Developer" },
          ],
        }}
        saveDebounceMs={250}
        onSave={onSave}
      >
        <SaveFields />
      </Form>
    ));

    fireEvent.input(screen.getByRole("textbox", { name: "Name" }), { target: { value: "Grace" } });
    vi.advanceTimersByTime(200);
    fireEvent.input(screen.getByRole("textbox", { name: "Role" }), { target: { value: "Engineer" } });
    vi.advanceTimersByTime(249);
    expect(onSave).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onSave).toHaveBeenCalledWith({ name: "Grace", role: "Engineer" });

    fireEvent.input(screen.getByRole("textbox", { name: "Name" }), { target: { value: "Ada" } });
    vi.advanceTimersByTime(250);
    expect(onSave).toHaveBeenLastCalledWith({ name: "Ada" });
  });

  it("does not save a field reverted during the debounce period", () => {
    vi.useFakeTimers();
    const onSave = vi.fn();
    render(() => (
      <Form model={{ attributes: [{ id: "name", label: "Name", initialValue: "Elliot" }] }} onSave={onSave}>
        <TestField />
      </Form>
    ));

    const input = screen.getByRole("textbox", { name: "Name" });
    fireEvent.input(input, { target: { value: "Grace" } });
    fireEvent.input(input, { target: { value: "Elliot" } });
    vi.advanceTimersByTime(500);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("stays dirty until an asynchronous save completes", async () => {
    vi.useFakeTimers();
    let completeSave: (() => void) | undefined;
    const onSave = () =>
      new Promise<void>((resolve) => {
        completeSave = resolve;
      });
    render(() => (
      <Form
        model={{ attributes: [{ id: "name", label: "Name", initialValue: "Elliot" }] }}
        saveDebounceMs={100}
        onSave={onSave}
      >
        <TestField />
        <DirtyIndicator />
      </Form>
    ));

    fireEvent.input(screen.getByRole("textbox", { name: "Name" }), { target: { value: "Grace" } });
    expect(screen.getByText("Dirty")).toBeTruthy();
    vi.advanceTimersByTime(100);
    expect(screen.getByText("Dirty")).toBeTruthy();
    completeSave?.();
    await Promise.resolve();
    expect(screen.getByText("Clean")).toBeTruthy();
  });

  it("flushes pending changes immediately on unmount", () => {
    vi.useFakeTimers();
    const onSave = vi.fn();
    const result = render(() => (
      <Form
        model={{ attributes: [{ id: "name", label: "Name", initialValue: "Elliot" }] }}
        saveDebounceMs={10_000}
        onSave={onSave}
      >
        <TestField />
      </Form>
    ));

    fireEvent.input(screen.getByRole("textbox", { name: "Name" }), { target: { value: "Grace" } });
    expect(onSave).not.toHaveBeenCalled();
    result.unmount();
    expect(onSave).toHaveBeenCalledOnce();
    expect(onSave).toHaveBeenCalledWith({ name: "Grace" });
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
