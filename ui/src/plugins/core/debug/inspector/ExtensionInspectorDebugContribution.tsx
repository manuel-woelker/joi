import { Show } from "solid-js";

import { useExtensionInspector } from "./extension-inspector";
import styles from "./ExtensionInspectorDebugContribution.module.css";

export function ExtensionInspectorDebugContribution() {
  const inspector = useExtensionInspector();
  return (
    <div class={styles.content}>
      <label class={styles.toggle}>
        <input
          type="checkbox"
          checked={inspector.enabled()}
          onChange={(event) => inspector.setEnabled(event.currentTarget.checked)}
        />
        Show extension boundaries
      </label>
      <p>
        <Show when={inspector.enabled()} fallback="Inspection is disabled.">
          Inspecting {inspector.markers().length} visual boundaries. Press Escape to stop.
        </Show>
      </p>
    </div>
  );
}
