import { For, Show, type JSX } from "solid-js";
import Trash2Icon from "lucide-solid/icons/trash-2";

import { IconButton } from "../IconButton";
import { DataText, ModelText } from "../SourceText";
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
  readonly onRemoveFacet?: (facetId: string) => void;
  readonly emptyLabel?: string;
  readonly renderValue?: (facet: Facet, value: FacetValue) => JSX.Element;
  readonly class?: string;
}

const sortedValues = (values: readonly FacetValue[]) =>
  values
    .map((value, index) => ({ value, index }))
    .sort((left, right) => right.value.count - left.value.count || left.index - right.index)
    .map(({ value }) => value);

/** Displays discrete filter values with separate include and exclude toggles. */
export function FacetFilter(props: FacetFilterProps) {
  return (
    <div class={`${styles.facets} ${props.class ?? ""}`} aria-label="Result facets">
      <For each={props.facets}>
        {(facet) => (
          <section class={styles.facet} aria-labelledby={`facet-${facet.id}`}>
            <header class={styles.header}>
              <div class={styles.heading}>
                <div>
                  <h3 id={`facet-${facet.id}`}>
                    <ModelText>{facet.label}</ModelText>
                  </h3>
                  <Show when={facet.description}>
                    <p>{facet.description}</p>
                  </Show>
                </div>
                <Show when={props.onRemoveFacet}>
                  <IconButton
                    label={`Remove ${facet.label} facet`}
                    icon={<Trash2Icon size={13} />}
                    class={styles.remove}
                    onClick={() => props.onRemoveFacet?.(facet.id)}
                  />
                </Show>
              </div>
            </header>
            <Show
              when={facet.values.length > 0}
              fallback={<p class={styles.empty}>{props.emptyLabel ?? "No values"}</p>}
            >
              <ul class={styles.values}>
                <For each={sortedValues(facet.values)}>
                  {(entry) => {
                    const state = () => entry.state ?? "neutral";
                    const toggle = (next: FacetValueState) =>
                      props.onValueChange(facet.id, entry.value, state() === next ? "neutral" : next);
                    return (
                      <li data-state={state()}>
                        <button
                          type="button"
                          class={styles.toggle}
                          data-active={state() === "included"}
                          aria-label={`Include ${entry.label} in ${facet.label}`}
                          aria-pressed={state() === "included"}
                          onClick={() => toggle("included")}
                        >
                          <span aria-hidden="true">+</span>
                        </button>
                        <button
                          type="button"
                          class={styles.toggle}
                          data-active={state() === "excluded"}
                          aria-label={`Exclude ${entry.label} from ${facet.label}`}
                          aria-pressed={state() === "excluded"}
                          onClick={() => toggle("excluded")}
                        >
                          <span aria-hidden="true">−</span>
                        </button>
                        <span class={styles.label}>
                          {props.renderValue?.(facet, entry) ?? <DataText>{entry.label}</DataText>}
                        </span>
                        <span class={styles.count}>
                          <DataText>{entry.count.toLocaleString()}</DataText>
                        </span>
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
