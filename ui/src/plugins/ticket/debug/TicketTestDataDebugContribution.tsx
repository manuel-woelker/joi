import { createSignal, Show } from "solid-js";

import type { FetchService } from "../../../base/services/fetch-service";
import { CommandService } from "../../../generated/api/command-service";
import styles from "./TicketTestDataDebugContribution.module.css";

export function TicketTestDataDebugContribution(props: { fetchService: FetchService }) {
  const commands = new CommandService(props.fetchService);
  const [count, setCount] = createSignal(1_000);
  const [running, setRunning] = createSignal(false);
  const [result, setResult] = createSignal<string>();
  const [error, setError] = createSignal<string>();

  const generate = async () => {
    if (running()) return;
    setRunning(true);
    setResult(undefined);
    setError(undefined);
    try {
      const response = await commands.generateTicketTestData({ count: count() });
      setResult(`Generated ${response.generated.toLocaleString()} tickets.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setRunning(false);
    }
  };

  return (
    <form
      class={styles.content}
      onSubmit={(event) => {
        event.preventDefault();
        void generate();
      }}
    >
      <p>Generate believable ticket records for development and performance testing.</p>
      <label>
        Tickets
        <input
          type="number"
          min="1"
          max="100000"
          step="100"
          value={count()}
          disabled={running()}
          onInput={(event) => setCount(event.currentTarget.valueAsNumber)}
        />
      </label>
      <button type="submit" disabled={running() || !Number.isInteger(count()) || count() < 1 || count() > 100_000}>
        {running() ? "Generating..." : "Generate tickets"}
      </button>
      <Show when={result()}>{(message) => <p class={styles.success}>{message()}</p>}</Show>
      <Show when={error()}>
        {(message) => (
          <p class={styles.error} role="alert">
            {message()}
          </p>
        )}
      </Show>
    </form>
  );
}
