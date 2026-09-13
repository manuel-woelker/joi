import { createSignal } from "solid-js";

import type { FetchService } from "../../../../base/services/fetch-service";
import styles from "./FetchDebugContribution.module.css";

export function FetchDebugContribution(props: { fetchService: FetchService }) {
  const initialDelay = props.fetchService.artificialDelayMs() || 1000;
  const [delay, setDelay] = createSignal(initialDelay);
  const [enabled, setEnabled] = createSignal(props.fetchService.artificialDelayMs() > 0);
  const apply = (nextEnabled = enabled(), nextDelay = delay()) => {
    props.fetchService.setArtificialDelayMs(nextEnabled ? nextDelay : 0);
  };

  return (
    <div class={styles.content}>
      <label class={styles.toggle}>
        <input
          type="checkbox"
          checked={enabled()}
          onChange={(event) => {
            const next = event.currentTarget.checked;
            setEnabled(next);
            apply(next);
          }}
        />
        Add an artificial delay to fetch requests
      </label>
      <label class={styles.delay}>
        Delay
        <input
          type="number"
          min="0"
          step="100"
          value={delay()}
          disabled={!enabled()}
          onInput={(event) => {
            const next = Math.max(0, event.currentTarget.valueAsNumber || 0);
            setDelay(next);
            apply(enabled(), next);
          }}
        />
        ms
      </label>
    </div>
  );
}
