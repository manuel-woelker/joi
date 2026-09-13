import GitCommitIcon from "lucide-solid/icons/git-commit-horizontal";
import { createResource, createSignal, Match, Show, Switch } from "solid-js";

import type { FetchService } from "../../../base/services/fetch-service";
import { CommandService } from "../../../generated/api/command-service";
import { CommitDiff } from "./CommitDiff";
import styles from "./CommitReviewView.module.css";

export interface CommitReviewViewProps {
  readonly service: FetchService;
  readonly branchId: string;
  readonly commitId: string;
}

/** Displays commit metadata, its review state, and text-file changes. */
export function CommitReviewView(props: CommitReviewViewProps) {
  const [tab, setTab] = createSignal<"overview" | "diff">("overview");
  const commands = new CommandService(props.service);
  const [commit] = createResource(
    () => ({ branchId: props.branchId, commitId: props.commitId }),
    (request) => commands.codevetteCommit(request),
  );
  return (
    <section class={styles.review}>
      <Switch>
        <Match when={commit.error}>
          <p class={styles.error}>Could not load commit: {String(commit.error)}</p>
        </Match>
        <Match when={commit.loading}>
          <p class={styles.loading}>Loading commit…</p>
        </Match>
        <Match when={commit()}>
          {(details) => (
            <>
              <header class={styles.header}>
                <GitCommitIcon size={20} />
                <div>
                  <h1>{subject(details().message)}</h1>
                  <code>{details().id.slice(0, 8)}</code>
                </div>
                <span class={styles.status}>{details().status.replaceAll("-", " ")}</span>
              </header>
              <nav class={styles.tabs} aria-label="Commit review">
                <button classList={{ [styles.active]: tab() === "overview" }} onClick={() => setTab("overview")}>
                  Overview
                </button>
                <button classList={{ [styles.active]: tab() === "diff" }} onClick={() => setTab("diff")}>
                  Diff
                </button>
              </nav>
              <Show
                when={tab() === "overview"}
                fallback={
                  <div class={styles.diffPane}>
                    <CommitDiff patch={details().patch} />
                  </div>
                }
              >
                <div class={styles.overviewPane}>
                  <div class={styles.overview}>
                    <dl class={styles.metadata}>
                      <div>
                        <dt>Author</dt>
                        <dd>{details().author}</dd>
                      </div>
                      <div>
                        <dt>Authored</dt>
                        <dd>
                          <time dateTime={details().authoredAt}>{new Date(details().authoredAt).toLocaleString()}</time>
                        </dd>
                      </div>
                      <div>
                        <dt>Commit</dt>
                        <dd>
                          <code>{details().id}</code>
                        </dd>
                      </div>
                      <div>
                        <dt>Parents</dt>
                        <dd>
                          {details().parentIds.map((id) => (
                            <code>{id.slice(0, 8)}</code>
                          ))}
                        </dd>
                      </div>
                    </dl>
                    <div class={styles.summary}>
                      <strong>{details().filesChanged} files</strong>
                      <span class={styles.added}>+{details().linesAdded}</span>
                      <span class={styles.deleted}>-{details().linesDeleted}</span>
                    </div>
                    <pre class={styles.message}>{details().message}</pre>
                  </div>
                </div>
              </Show>
            </>
          )}
        </Match>
      </Switch>
    </section>
  );
}

function subject(message: string) {
  return message.split(/\r?\n/, 1)[0] || "Commit";
}
