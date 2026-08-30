import { createContext, useContext, type JSX, type ParentProps } from "solid-js";
import { createStore, type SetStoreFunction } from "solid-js/store";

/** Properties for a form state provider. */
export interface FormProps extends ParentProps {
  /** Describes the fields and their initial values. */
  readonly model: FormModel;
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
  readonly setState: SetStoreFunction<FormState>;
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
  const [state, setState] = createStore<FormState>({
    values: Object.fromEntries(props.model.attributes.map((attribute) => [attribute.id, attribute.initialValue])),
  });

  return <FormContext.Provider value={{ model: props.model, state, setState }}>{props.children}</FormContext.Provider>;
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

  const setValue = (value: string) => form.setState("values", fieldId, value);
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
