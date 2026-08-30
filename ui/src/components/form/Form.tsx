import { createContext, onCleanup, useContext, type JSX, type ParentProps } from "solid-js";
import { createStore } from "solid-js/store";

/** Field values changed since the previous debounced save. */
export type FormChanges = Readonly<Record<string, string>>;

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
}

/** Describes the fields available to descendants of a {@link Form}. */
export interface FormModel {
  readonly attributes: readonly FormAttribute[];
}

interface FormState {
  readonly values: Record<string, string>;
}

interface FormContextValue {
  readonly model: FormModel;
  readonly state: FormState;
  readonly setValue: (fieldId: string, value: string) => void;
}

/** Reactive field state exposed to form controls. */
export interface FormField {
  readonly id: string;
  readonly label: string;
  /** Current field value. Reading this property participates in Solid reactivity. */
  readonly value: string;
  /** Updates the field value directly. */
  readonly setValue: (value: string) => void;
  /** Input handler that updates the field on every typed character. */
  readonly onInput: JSX.EventHandler<HTMLInputElement, InputEvent>;
}

const FormContext = createContext<FormContextValue>();

/** Creates a form store and provides it to descendant field components. */
export function Form(props: FormProps) {
  validateModel(props.model);
  const initialValues = Object.fromEntries(
    props.model.attributes.map((attribute) => [attribute.id, attribute.initialValue]),
  );
  const [state, setState] = createStore<FormState>({
    values: initialValues,
  });
  const submittedValues = { ...initialValues };
  let saveTimer: ReturnType<typeof setTimeout> | undefined;

  const flushSave = () => {
    saveTimer = undefined;
    if (!props.onSave) return;
    const changes = Object.fromEntries(
      props.model.attributes
        .filter((attribute) => state.values[attribute.id] !== submittedValues[attribute.id])
        .map((attribute) => [attribute.id, state.values[attribute.id]]),
    );
    if (Object.keys(changes).length === 0) return;
    Object.assign(submittedValues, changes);
    void props.onSave(Object.freeze(changes));
  };

  const setValue = (fieldId: string, value: string) => {
    if (state.values[fieldId] === value) return;
    setState("values", fieldId, value);
    if (!props.onSave) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, Math.max(0, props.saveDebounceMs ?? 500));
  };

  onCleanup(() => {
    if (saveTimer) clearTimeout(saveTimer);
    flushSave();
  });

  return <FormContext.Provider value={{ model: props.model, state, setValue }}>{props.children}</FormContext.Provider>;
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
