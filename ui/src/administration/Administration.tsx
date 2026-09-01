import { For } from "solid-js";
import { Dynamic } from "solid-js/web";
import type { PluginRegistry } from "../plugins/registry";
import styles from "./Administration.module.css";
import { type AdministrationContribution, administrationContributions } from "./contribution";

export function administrationEntries(registry: PluginRegistry): AdministrationContribution[] {
  return [...registry.extensions(administrationContributions)].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}

export function Administration(props: {
  registry: PluginRegistry;
  selectedId?: string;
  onSelect: (contribution: AdministrationContribution) => void;
}) {
  const contributions = administrationEntries(props.registry);

  return (
    <section class={styles.administration} aria-labelledby="administration-heading">
      <h2 id="administration-heading" class={styles.heading}>
        Administration
      </h2>
      <For each={contributions}>
        {(contribution) => (
          <button
            class={styles.contribution}
            classList={{ [styles.selected]: props.selectedId === contribution.id }}
            onClick={() => props.onSelect(contribution)}
          >
            {contribution.icon && <Dynamic component={contribution.icon} size={16} aria-hidden="true" />}
            {contribution.name}
          </button>
        )}
      </For>
    </section>
  );
}
