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

/** A form validation failure annotated with whether its associated field was touched. */
export interface FormValidationFailure extends ValidationFailure {
  readonly touched: boolean;
}

/** Properties for a form state provider. */
export interface FormProps extends ParentProps {
  /** Describes the fields and their initial values. */
  readonly model: FormModel;
  /** Receives changed values after input is idle or immediately before unmount. */
  readonly onSave?: (changes: FormChanges) => void | Promise<void>;
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
  readonly validationMessages: Accessor<readonly FormValidationFailure[]>;
  readonly setValue: (fieldId: string, value: string) => void;
  readonly setTouched: (fieldId: string) => void;
  readonly reset: () => void;
}

/** Reactive state shared by all controls in a form. */
export interface FormRuntimeState {
  /** Whether current values contain changes not confirmed by a successful save. */
  readonly dirty: Accessor<boolean>;
  /** Current model and rule validation failures. */
  readonly validationMessages: Accessor<readonly FormValidationFailure[]>;
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
  /** Whether the field has lost focus after being focused. */
  readonly touched: Accessor<boolean>;
  /** Current validation failures associated with this field. */
  readonly validationMessages: Accessor<readonly FormValidationFailure[]>;
  /** Current field value. Reading this property participates in Solid reactivity. */
  readonly value: string;
  /** Updates the field value directly. */
  readonly setValue: (value: string) => void;
  /** Input handler that updates the field on every typed character. */
  readonly onInput: JSX.EventHandler<HTMLInputElement | HTMLTextAreaElement, InputEvent>;
  /** Blur handler that marks the field as touched. */
  readonly onBlur: JSX.EventHandler<HTMLInputElement | HTMLTextAreaElement, FocusEvent>;
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
  const validationMessages = createMemo(() => {
    const touched = (failure: ValidationFailure) =>
      failure.attribute === undefined
        ? Object.values(state.touched).some(Boolean)
        : (state.touched[failure.attribute] ?? false);
    const externalFailures = (model.validationMessages ?? []).map((failure) => ({ ...failure, touched: true }));
    const formFailures = model.validation
      ? validate(state.values, model.validation).failures.map((failure) => ({ ...failure, touched: touched(failure) }))
      : [];
    const attributeFailures = model.attributes.flatMap((attribute) =>
      attribute.validation
        ? validate(state.values[attribute.id], attribute.validation).failures.map((failure) => ({
            ...failure,
            attribute: attribute.id,
            touched: state.touched[attribute.id] ?? false,
          }))
        : [],
    );
    return [...externalFailures, ...formFailures, ...attributeFailures];
  });
  const submittedValues = { ...initialValues };
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let saveInProgress = false;
  let saveRequested = false;

  const hasChanges = () =>
    model.attributes.some((attribute) => state.values[attribute.id] !== submittedValues[attribute.id]);

  const flushSave = async () => {
    saveTimer = undefined;
    if (!props.onSave) return;
    if (validationMessages().length > 0) return;
    if (saveInProgress) {
      saveRequested = true;
      return;
    }
    const changes = Object.fromEntries(
      model.attributes
        .filter((attribute) => state.values[attribute.id] !== submittedValues[attribute.id])
        .map((attribute) => [attribute.id, state.values[attribute.id]]),
    );
    if (Object.keys(changes).length === 0) {
      setDirty(false);
      return;
    }
    saveInProgress = true;
    try {
      const result = props.onSave(Object.freeze(changes));
      if (result) await result;
      Object.assign(submittedValues, changes);
    } catch {
      // The callback owns save error presentation; the form remains dirty.
    } finally {
      saveInProgress = false;
      setDirty(hasChanges());
      if (saveRequested) {
        saveRequested = false;
        void flushSave();
      }
    }
  };

  const setValue = (fieldId: string, value: string) => {
    if (state.values[fieldId] === value) return;
    setState("values", fieldId, value);
    setDirty(saveInProgress || hasChanges());
    if (!props.onSave) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void flushSave(), Math.max(0, props.saveDebounceMs ?? 500));
  };
  const setTouched = (fieldId: string) => setState("touched", fieldId, true);
  const reset = () => {
    if (saveInProgress) throw new Error("Form cannot be reset while a save is in progress");
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = undefined;
    saveRequested = false;
    for (const attribute of model.attributes) {
      setState("values", attribute.id, submittedValues[attribute.id]);
      setState("touched", attribute.id, false);
    }
    setDirty(false);
  };

  onCleanup(() => {
    if (saveTimer) clearTimeout(saveTimer);
    void flushSave();
  });

  return (
    <FormContext.Provider value={{ model, state, dirty, validationMessages, setValue, setTouched, reset }}>
      {props.children}
    </FormContext.Provider>
  );
}

/** Returns reactive state for the nearest form. */
export function useFormState(): FormRuntimeState {
  const form = useContext(FormContext);
  if (!form) throw new Error("useFormState must be called inside a Form");
  return { dirty: form.dirty, validationMessages: form.validationMessages, reset: form.reset };
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
  const onInput: FormField["onInput"] = attribute.readonly
    ? () => {
        throw new Error(`Form field '${fieldId}' is readonly`);
      }
    : (event) => setValue(event.currentTarget.value);
  return {
    id: attribute.id,
    label: attribute.label,
    placeholder: attribute.placeholder,
    readonly: attribute.readonly ?? false,
    touched: () => form.state.touched[fieldId] ?? false,
    validationMessages: () => form.validationMessages().filter((failure) => failure.attribute === fieldId),
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
