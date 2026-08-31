import {
  createContext,
  createMemo,
  createSignal,
  onCleanup,
  useContext,
  type Accessor,
  type JSX,
  type ParentProps,
} from "solid-js";
import { createStore } from "solid-js/store";

import { validate, type ValidationFailure, type ValidationFunction } from "../../validation/validation";

/** Field values changed since the previous debounced save. */
export type FormChanges = Readonly<Record<string, string>>;
/** Complete string-valued state validated by a form model. */
export type FormValues = Readonly<Record<string, string>>;

/** Persistence lifecycle used by a form. */
export type FormPersistence =
  | {
      readonly type: "autosave";
      readonly onSave: (changes: FormChanges) => void | Promise<void>;
    }
  | {
      readonly type: "submit";
      readonly onSubmit: (values: FormValues) => void | Promise<void>;
    };

/** A form validation failure annotated with whether its associated field was touched. */
export interface FormValidationFailure extends ValidationFailure {
  readonly touched: boolean;
}

/** Current validity and annotated failures for a form. */
export interface FormValidationResult {
  readonly valid: boolean;
  readonly failures: readonly FormValidationFailure[];
}

/** Properties for a form state provider. */
export interface FormProps extends ParentProps {
  /** Describes the fields and their initial values. */
  readonly model: FormModel;
  /** Optional persistence lifecycle. Submit mode never saves implicitly. */
  readonly persistence?: FormPersistence;
  /** Debounce period in milliseconds. Defaults to 500. */
  readonly saveDebounceMs?: number;
}

/** Static metadata and initial state for one form field. */
export interface FormAttribute {
  /** Unique field identifier used by {@link useFormField}. */
  readonly id: string;
  /** Human-readable field label. */
  readonly label: string;
  /** Value assigned when the form store is created. */
  readonly initialValue: string;
  /** Hint displayed by controls while the field value is empty. */
  readonly placeholder?: string;
  /** Whether user input is rejected for this field. Defaults to false. */
  readonly readonly?: boolean;
  /** Whether the field is unavailable and excluded from validation and saving. */
  readonly disabled?: boolean;
  /** Validation evaluated with this field's current value. */
  readonly validation?: ValidationFunction<string>;
}

/** Describes the fields available to descendants of a {@link Form}. */
export interface FormModel {
  readonly attributes: readonly FormAttribute[];
  /** Validation evaluated against all current field values. */
  readonly validation?: ValidationFunction<FormValues>;
  /** External failures, such as messages returned by a server. */
  readonly validationMessages?: readonly ValidationFailure[];
}

interface FormState {
  readonly values: Record<string, string>;
  readonly touched: Record<string, boolean>;
}

interface FormContextValue {
  readonly model: FormModel;
  readonly state: FormState;
  readonly dirty: Accessor<boolean>;
  readonly validationResult: Accessor<FormValidationResult>;
  readonly saving: Accessor<boolean>;
  readonly saveError: Accessor<Error | undefined>;
  readonly isDirty: (fieldId: string) => boolean;
  readonly setValue: (fieldId: string, value: string) => void;
  readonly setTouched: (fieldId: string) => void;
  readonly reset: () => void;
  readonly submit: () => Promise<boolean>;
}

/** Reactive state shared by all controls in a form. */
export interface FormRuntimeState {
  /** Whether current values contain changes not confirmed by a successful save. */
  readonly dirty: Accessor<boolean>;
  /** Whether the current form values have no validation failures. */
  readonly valid: Accessor<boolean>;
  /** Whether an asynchronous save is in progress. */
  readonly saving: Accessor<boolean>;
  /** Most recent save error, cleared by a successful save or reset. */
  readonly saveError: Accessor<Error | undefined>;
  /** Current model and rule validation failures. */
  readonly validationMessages: Accessor<readonly FormValidationFailure[]>;
  /** Returns the current validation result without changing touched state. */
  readonly validate: () => FormValidationResult;
  /** Complete current form values. */
  readonly values: Accessor<FormValues>;
  /** Explicitly submits a submit-mode form. Returns whether it succeeded. */
  readonly submit: () => Promise<boolean>;
  /** Restores the most recently saved values and clears touched state. */
  readonly reset: () => void;
}

/** Reactive field state exposed to form controls. */
export interface FormField {
  readonly id: string;
  readonly label: string;
  /** Hint displayed by controls while the field value is empty. */
  readonly placeholder?: string;
  /** Whether the field rejects user input. */
  readonly readonly: boolean;
  /** Whether the field is unavailable. */
  readonly disabled: boolean;
  /** Whether this field differs from its most recently saved value. */
  readonly dirty: Accessor<boolean>;
  /** Whether the field has lost focus after being focused. */
  readonly touched: Accessor<boolean>;
  /** Current validation failures associated with this field. */
  readonly validationMessages: Accessor<readonly FormValidationFailure[]>;
  /** Current field value. Reading this property participates in Solid reactivity. */
  readonly value: string;
  /** Updates the field value directly. */
  readonly setValue: (value: string) => void;
  /** Input handler that updates the field on every typed character. */
  readonly onInput: JSX.EventHandler<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, InputEvent>;
  /** Blur handler that marks the field as touched. */
  readonly onBlur: JSX.EventHandler<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, FocusEvent>;
}

const FormContext = createContext<FormContextValue>();

/** Creates a form store and provides it to descendant field components. */
export function Form(props: FormProps) {
  const model = props.model;
  validateModel(model);
  const initialValues = Object.fromEntries(model.attributes.map((attribute) => [attribute.id, attribute.initialValue]));
  const [state, setState] = createStore<FormState>({
    values: initialValues,
    touched: Object.fromEntries(model.attributes.map((attribute) => [attribute.id, false])),
  });
  const [dirty, setDirty] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const [saveError, setSaveError] = createSignal<Error>();
  const validationResult = createMemo<FormValidationResult>(() => {
    const touched = (failure: ValidationFailure) =>
      failure.attribute === undefined
        ? Object.values(state.touched).some(Boolean)
        : (state.touched[failure.attribute] ?? false);
    const externalFailures = (model.validationMessages ?? []).map((failure) => ({ ...failure, touched: true }));
    const formFailures = model.validation
      ? validate(state.values, model.validation).failures.map((failure) => ({ ...failure, touched: touched(failure) }))
      : [];
    const attributeFailures = model.attributes.flatMap((attribute) =>
      attribute.validation && !attribute.disabled
        ? validate(state.values[attribute.id], attribute.validation).failures.map((failure) => ({
            ...failure,
            attribute: attribute.id,
            touched: state.touched[attribute.id] ?? false,
          }))
        : [],
    );
    const failures = [...externalFailures, ...formFailures, ...attributeFailures];
    return { valid: failures.length === 0, failures };
  });
  const submittedValues = { ...initialValues };
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let saveRequested = false;

  const hasChanges = () =>
    model.attributes.some(
      (attribute) => !attribute.disabled && state.values[attribute.id] !== submittedValues[attribute.id],
    );
  const isDirty = (fieldId: string) => state.values[fieldId] !== submittedValues[fieldId];

  const flushSave = async () => {
    saveTimer = undefined;
    if (props.persistence?.type !== "autosave") return;
    if (!validationResult().valid) return;
    if (saving()) {
      saveRequested = true;
      return;
    }
    const changes = Object.fromEntries(
      model.attributes
        .filter((attribute) => !attribute.disabled && state.values[attribute.id] !== submittedValues[attribute.id])
        .map((attribute) => [attribute.id, state.values[attribute.id]]),
    );
    if (Object.keys(changes).length === 0) {
      setDirty(false);
      return;
    }
    setSaving(true);
    setSaveError(undefined);
    try {
      const result = props.persistence.onSave(Object.freeze(changes));
      if (result) await result;
      Object.assign(submittedValues, changes);
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause : new Error(String(cause)));
    } finally {
      setSaving(false);
      setDirty(hasChanges());
      if (saveRequested) {
        saveRequested = false;
        void flushSave();
      }
    }
  };

  const setValue = (fieldId: string, value: string) => {
    const attribute = model.attributes.find((candidate) => candidate.id === fieldId);
    if (attribute?.disabled) throw new Error(`Form field '${fieldId}' is disabled`);
    if (state.values[fieldId] === value) return;
    setState("values", fieldId, value);
    setDirty(saving() || hasChanges());
    if (props.persistence?.type !== "autosave") return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void flushSave(), Math.max(0, props.saveDebounceMs ?? 500));
  };
  const setTouched = (fieldId: string) => setState("touched", fieldId, true);
  const reset = () => {
    if (saving()) throw new Error("Form cannot be reset while a save is in progress");
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = undefined;
    saveRequested = false;
    for (const attribute of model.attributes) {
      setState("values", attribute.id, submittedValues[attribute.id]);
      setState("touched", attribute.id, false);
    }
    setDirty(false);
    setSaveError(undefined);
  };
  const submit = async (): Promise<boolean> => {
    if (props.persistence?.type !== "submit") throw new Error("Form is not configured for explicit submission");
    if (saving()) return false;
    for (const attribute of model.attributes) {
      if (!attribute.disabled) setState("touched", attribute.id, true);
    }
    if (!validationResult().valid) return false;
    setSaving(true);
    setSaveError(undefined);
    try {
      const values = Object.freeze({ ...state.values });
      const result = props.persistence.onSubmit(values);
      if (result) await result;
      Object.assign(submittedValues, values);
      setDirty(false);
      return true;
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause : new Error(String(cause)));
      setDirty(hasChanges());
      return false;
    } finally {
      setSaving(false);
    }
  };

  onCleanup(() => {
    if (saveTimer) clearTimeout(saveTimer);
    if (props.persistence?.type === "autosave") void flushSave();
  });

  return (
    <FormContext.Provider
      value={{ model, state, dirty, validationResult, saving, saveError, isDirty, setValue, setTouched, reset, submit }}
    >
      {props.children}
    </FormContext.Provider>
  );
}

/** Returns reactive state for the nearest form. */
export function useFormState(): FormRuntimeState {
  const form = useContext(FormContext);
  if (!form) throw new Error("useFormState must be called inside a Form");
  return {
    dirty: form.dirty,
    valid: () => form.validationResult().valid,
    saving: form.saving,
    saveError: form.saveError,
    validationMessages: () => form.validationResult().failures,
    validate: form.validationResult,
    values: () => Object.freeze({ ...form.state.values }),
    submit: form.submit,
    reset: form.reset,
  };
}

/**
 * Returns reactive state and input bindings for a field in the nearest form.
 *
 * @throws When called outside a form or when the field is not in its model.
 */
export function useFormField(fieldId: string): FormField {
  const form = useContext(FormContext);
  if (!form) throw new Error("useFormField must be called inside a Form");
  const attribute = form.model.attributes.find((candidate) => candidate.id === fieldId);
  if (!attribute) throw new Error(`Form field '${fieldId}' is not defined`);

  const setValue = (value: string) => form.setValue(fieldId, value);
  const onInput: FormField["onInput"] =
    attribute.readonly || attribute.disabled
      ? () => {
          throw new Error(`Form field '${fieldId}' is ${attribute.disabled ? "disabled" : "readonly"}`);
        }
      : (event) => setValue(event.currentTarget.value);
  return {
    id: attribute.id,
    label: attribute.label,
    placeholder: attribute.placeholder,
    readonly: attribute.readonly ?? false,
    disabled: attribute.disabled ?? false,
    dirty: () => {
      form.dirty();
      return form.isDirty(fieldId);
    },
    touched: () => form.state.touched[fieldId] ?? false,
    validationMessages: () => form.validationResult().failures.filter((failure) => failure.attribute === fieldId),
    get value() {
      return form.state.values[fieldId];
    },
    setValue,
    onInput,
    onBlur: () => form.setTouched(fieldId),
  };
}

function validateModel(model: FormModel) {
  const ids = new Set<string>();
  for (const attribute of model.attributes) {
    if (ids.has(attribute.id)) throw new Error(`Form field '${attribute.id}' is defined more than once`);
    ids.add(attribute.id);
  }
}
