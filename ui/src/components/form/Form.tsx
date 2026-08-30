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
}

interface FormContextValue {
  readonly model: FormModel;
  readonly state: FormState;
  readonly dirty: Accessor<boolean>;
  readonly validationMessages: Accessor<readonly ValidationFailure[]>;
  readonly setValue: (fieldId: string, value: string) => void;
}

/** Reactive state shared by all controls in a form. */
export interface FormRuntimeState {
  /** Whether current values contain changes not confirmed by a successful save. */
  readonly dirty: Accessor<boolean>;
  /** Current model and rule validation failures. */
  readonly validationMessages: Accessor<readonly ValidationFailure[]>;
}

/** Reactive field state exposed to form controls. */
export interface FormField {
  readonly id: string;
  readonly label: string;
  /** Current validation failures associated with this field. */
  readonly validationMessages: Accessor<readonly ValidationFailure[]>;
  /** Current field value. Reading this property participates in Solid reactivity. */
  readonly value: string;
  /** Updates the field value directly. */
  readonly setValue: (value: string) => void;
  /** Input handler that updates the field on every typed character. */
  readonly onInput: JSX.EventHandler<HTMLInputElement | HTMLTextAreaElement, InputEvent>;
}

const FormContext = createContext<FormContextValue>();

/** Creates a form store and provides it to descendant field components. */
export function Form(props: FormProps) {
  const model = props.model;
  validateModel(model);
  const initialValues = Object.fromEntries(model.attributes.map((attribute) => [attribute.id, attribute.initialValue]));
  const [state, setState] = createStore<FormState>({
    values: initialValues,
  });
  const [dirty, setDirty] = createSignal(false);
  const validationMessages = createMemo(() => {
    const formFailures = model.validation ? validate(state.values, model.validation).failures : [];
    const attributeFailures = model.attributes.flatMap((attribute) =>
      attribute.validation
        ? validate(state.values[attribute.id], attribute.validation).failures.map((failure) => ({
            ...failure,
            attribute: attribute.id,
          }))
        : [],
    );
    return [...(model.validationMessages ?? []), ...formFailures, ...attributeFailures];
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

  onCleanup(() => {
    if (saveTimer) clearTimeout(saveTimer);
    void flushSave();
  });

  return (
    <FormContext.Provider value={{ model, state, dirty, validationMessages, setValue }}>
      {props.children}
    </FormContext.Provider>
  );
}

/** Returns reactive state for the nearest form. */
export function useFormState(): FormRuntimeState {
  const form = useContext(FormContext);
  if (!form) throw new Error("useFormState must be called inside a Form");
  return { dirty: form.dirty, validationMessages: form.validationMessages };
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
  return {
    id: attribute.id,
    label: attribute.label,
    validationMessages: () => form.validationMessages().filter((failure) => failure.attribute === fieldId),
    get value() {
      return form.state.values[fieldId];
    },
    setValue,
    onInput: (event) => setValue(event.currentTarget.value),
  };
}

function validateModel(model: FormModel) {
  const ids = new Set<string>();
  for (const attribute of model.attributes) {
    if (ids.has(attribute.id)) throw new Error(`Form field '${attribute.id}' is defined more than once`);
    ids.add(attribute.id);
  }
}
