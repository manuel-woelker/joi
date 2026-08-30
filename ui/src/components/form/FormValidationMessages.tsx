import { For, Show } from "solid-js";

import { useFormState } from "./Form";
import styles from "./FormValidationMessages.module.css";

/** Properties selecting validation messages to display. */
export interface FormValidationMessagesProps {
  /** Attribute whose failures should be shown. Omit to show form-level failures. */
  readonly attribute?: string;
  /** Optional ID used by a control's `aria-describedby` attribute. */
  readonly id?: string;
}

/** Displays validation failures from the nearest form model. */
export function FormValidationMessages(props: FormValidationMessagesProps) {
  const form = useFormState();
  const messages = () =>
    form
      .validationMessages()
      .filter((failure) =>
        props.attribute === undefined ? failure.attribute === undefined : failure.attribute === props.attribute,
      )
      .filter((failure) => failure.touched);
  return (
    <Show when={messages().length > 0}>
      <div id={props.id} class={styles.messages} role="alert">
        <For each={messages()}>{(failure) => <span>{failure.message}</span>}</For>
      </div>
    </Show>
  );
}
