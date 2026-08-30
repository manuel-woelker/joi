import { For, Show, createEffect, createSignal, onCleanup } from "solid-js";

import type { PlaygroundDemo } from "./demo";
import { demoLibrary } from "./demo-discovery";
import { playgroundHash, selectPlaygroundRoute } from "./playground-route";
import styles from "./PlaygroundApp.module.css";

export interface PlaygroundAppProps {
  readonly library?: readonly PlaygroundDemo[];
}

export function PlaygroundApp(props: PlaygroundAppProps) {
  const library = () => props.library ?? demoLibrary;
  const [hash, setHash] = createSignal(window.location.hash);
  const onHashChange = () => setHash(window.location.hash);
  window.addEventListener("hashchange", onHashChange);
  onCleanup(() => window.removeEventListener("hashchange", onHashChange));

  const selection = () => selectPlaygroundRoute(hash(), library());
  createEffect(() => {
    const current = selection();
    if (!current) return;
    const canonicalHash = playgroundHash(current.demo.id, current.scenarioName);
    if (window.location.hash !== canonicalHash) {
      window.history.replaceState(null, "", canonicalHash);
      setHash(canonicalHash);
    }
  });

  return (
    <div class={styles.shell}>
      <header class={styles.topBar}>
        <a class={styles.brand} href="#/views/view-active">
          Joi
        </a>
        <span class={styles.divider} aria-hidden="true" />
        <strong>Component playground</strong>
      </header>
      <Show
        when={selection()}
        fallback={
          <main class={styles.emptyState}>
            <h1>No component demos</h1>
            <p>
              Add a colocated <code>*.demo.tsx</code> file to populate the playground.
            </p>
          </main>
        }
      >
        {(current) => (
          <div class={styles.layout}>
            <nav class={styles.navigation} aria-label="Component demos">
              <For each={library()}>
                {(demo) => (
                  <section class={styles.navigationGroup}>
                    <a
                      class={styles.demoLink}
                      classList={{ [styles.activeDemo]: demo.id === current().demo.id }}
                      href={playgroundHash(demo.id, demo.scenarios[0].name)}
                    >
                      <strong>{demo.name}</strong>
                      <span>{demo.description}</span>
                    </a>
                    <Show when={demo.id === current().demo.id}>
                      <div class={styles.scenarioLinks}>
                        <For each={demo.scenarios}>
                          {(scenario) => (
                            <a
                              href={playgroundHash(demo.id, scenario.name)}
                              aria-current={scenario.name === current().scenarioName ? "page" : undefined}
                            >
                              {scenario.name}
                            </a>
                          )}
                        </For>
                      </div>
                    </Show>
                  </section>
                )}
              </For>
            </nav>
            <main class={styles.main}>
              <header class={styles.demoHeader}>
                <h1>{current().demo.name}</h1>
                <p>{current().demo.description}</p>
              </header>
              <div class={styles.scenarios}>
                <For each={current().demo.scenarios}>
                  {(scenario) => (
                    <section
                      class={styles.scenario}
                      classList={{ [styles.activeScenario]: scenario.name === current().scenarioName }}
                      aria-labelledby={`scenario-${encodeURIComponent(scenario.name)}`}
                    >
                      <header class={styles.scenarioHeader}>
                        <h2 id={`scenario-${encodeURIComponent(scenario.name)}`}>{scenario.name}</h2>
                        <Show when={scenario.description}>{(description) => <p>{description()}</p>}</Show>
                      </header>
                      <div class={styles.preview}>{scenario.render()}</div>
                    </section>
                  )}
                </For>
              </div>
            </main>
          </div>
        )}
      </Show>
    </div>
  );
}
