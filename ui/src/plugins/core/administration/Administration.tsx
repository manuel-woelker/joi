import { For } from "solid-js";
import { Dynamic } from "solid-js/web";
import type { PluginRegistryAccess } from "../../../base/plugin-registry";
import { InspectableExtension, InspectableExtensionPoint } from "../debug/inspector/extension-inspector";
import styles from "./Administration.module.css";
import { type AdministrationContribution, administrationContributions } from "./contribution";

export function administrationEntries(registry: PluginRegistryAccess): AdministrationContribution[] {
  return [...registry.extensions(administrationContributions)].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}

export function Administration(props: {
  registry: PluginRegistryAccess;
  selectedId?: string;
  onSelect: (contribution: AdministrationContribution) => void;
}) {
  const contributions = [...props.registry.extensionEntries(administrationContributions)].sort((left, right) =>
    left.value.name.localeCompare(right.value.name),
  );

  return (
    <section class={styles.administration} aria-labelledby="administration-heading">
      <h2 id="administration-heading" class={styles.heading}>
        Administration
      </h2>
      <InspectableExtensionPoint id={administrationContributions.id}>
        <For each={contributions}>
          {(entry) => (
            <InspectableExtension id={entry.id}>
              <button
                class={styles.contribution}
                classList={{ [styles.contributionSelected]: props.selectedId === entry.value.id }}
                onClick={() => props.onSelect(entry.value)}
              >
                {entry.value.icon && <Dynamic component={entry.value.icon} size={16} aria-hidden="true" />}
                {entry.value.name}
              </button>
            </InspectableExtension>
          )}
        </For>
      </InspectableExtensionPoint>
    </section>
  );
}
