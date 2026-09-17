import { For, Show, type JSX } from "solid-js";

import styles from "./FacetFilter.module.css";

export type FacetValueState = "neutral" | "included" | "excluded";

export interface FacetValue {
  readonly value: string;
  readonly label: string;
  readonly count: number;
  readonly state?: FacetValueState;
}

export interface Facet {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly values: readonly FacetValue[];
}

export interface FacetFilterProps {
  readonly facets: readonly Facet[];
  readonly onValueChange: (facetId: string, value: string, state: FacetValueState) => void;
  readonly emptyLabel?: string;
  readonly renderValue?: (facet: Facet, value: FacetValue) => JSX.Element;
  readonly class?: string;
}

const nextState = (state: FacetValueState | undefined): FacetValueState => {
  if (!state || state === "neutral") return "included";
  if (state === "included") return "excluded";
  return "neutral";
};

const stateLabel = (state: FacetValueState | undefined) => {
  if (state === "included") return "Included";
  if (state === "excluded") return "Excluded";
  return "Not filtered";
};

const sortedValues = (values: readonly FacetValue[]) =>
  values
    .map((value, index) => ({ value, index }))
    .sort((left, right) => right.value.count - left.value.count || left.index - right.index)
    .map(({ value }) => value);

/** Displays discrete filter values and cycles each through neutral, included, and excluded states. */
export function FacetFilter(props: FacetFilterProps) {
  return (
    <div class={`${styles.facets} ${props.class ?? ""}`} aria-label="Result facets">
      <For each={props.facets}>
        {(facet) => (
          <section class={styles.facet} aria-labelledby={`facet-${facet.id}`}>
            <header class={styles.header}>
              <h3 id={`facet-${facet.id}`}>{facet.label}</h3>
              <Show when={facet.description}>
                <p>{facet.description}</p>
              </Show>
            </header>
            <Show
              when={facet.values.length > 0}
              fallback={<p class={styles.empty}>{props.emptyLabel ?? "No values"}</p>}
            >
              <ul class={styles.values}>
                <For each={sortedValues(facet.values)}>
                  {(entry) => {
                    const state = () => entry.state ?? "neutral";
                    return (
                      <li>
                        <button
                          type="button"
                          class={styles.value}
                          data-state={state()}
                          aria-label={`${facet.label}: ${entry.label}. ${state() === "included" ? "Included" : state() === "excluded" ? "Excluded" : "Not filtered"}. ${entry.count} matches.`}
                          aria-pressed={state() === "included" ? "true" : state() === "excluded" ? "mixed" : "false"}
                          onClick={() => props.onValueChange(facet.id, entry.value, nextState(state()))}
                        >
                          <span class={styles.marker} aria-hidden="true">
                            {state() === "included" ? "+" : state() === "excluded" ? "−" : ""}
                          </span>
                          <span class={styles.label}>{props.renderValue?.(facet, entry) ?? entry.label}</span>
                          <span class={styles.state} aria-hidden="true">
                            {stateLabel(state())}
                          </span>
                          <span class={styles.count}>{entry.count.toLocaleString()}</span>
                        </button>
                      </li>
                    );
                  }}
                </For>
              </ul>
            </Show>
          </section>
        )}
      </For>
    </div>
  );
}
