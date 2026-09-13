import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";

import type { GitHistoryCommit, GitHistoryCursor, GitHistorySource } from "./git-history";
import { layoutGitHistory, type GitHistoryGraphRow } from "./git-history-layout";
import styles from "./GitHistory.module.css";

export interface GitHistoryProps {
  readonly source: GitHistorySource;
  readonly pageSize?: number;
  readonly ariaLabel?: string;
  readonly now?: () => Date;
  readonly onCommitSelect?: (commit: GitHistoryCommit) => void;
}

const laneWidth = 18;
const graphPadding = 9;

/** Displays a paged Git ancestry graph with commit metadata. */
export function GitHistory(props: GitHistoryProps) {
  const [commits, setCommits] = createSignal<GitHistoryCommit[]>([]);
  const [cursor, setCursor] = createSignal<GitHistoryCursor>();
  const [started, setStarted] = createSignal(false);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string>();
  const graph = createMemo(() => layoutGitHistory(commits()));

  const load = async (nextCursor?: GitHistoryCursor) => {
    if (loading()) return;
    setLoading(true);
    setError(undefined);
    try {
      const page = await props.source.loadCommits({ cursor: nextCursor, limit: props.pageSize ?? 50 });
      setCommits((current) => {
        const known = new Set(current.map((commit) => commit.id));
        return [...current, ...page.commits.filter((commit) => !known.has(commit.id))];
      });
      setCursor(page.nextCursor);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setStarted(true);
      setLoading(false);
    }
  };

  onMount(() => void load());

  return (
    <section class={styles.history} aria-label={props.ariaLabel ?? "Git history"} aria-busy={loading()}>
      <Show when={commits().length > 0}>
        <ol class={styles.commits}>
          <For each={commits()}>
            {(commit, index) => {
              const row = () => graph()[index()];
              const message = () => splitMessage(commit.message);
              return (
                <li
                  class={styles.commit}
                  classList={{ [styles.selectable]: Boolean(props.onCommitSelect) }}
                  onClick={() => props.onCommitSelect?.(commit)}
                  onKeyDown={(event) => {
                    if (props.onCommitSelect && (event.key === "Enter" || event.key === " ")) {
                      event.preventDefault();
                      props.onCommitSelect(commit);
                    }
                  }}
                  role={props.onCommitSelect ? "button" : undefined}
                  tabIndex={props.onCommitSelect ? 0 : undefined}
                >
                  <CommitGraph row={row()} />
                  <div class={styles.details}>
                    <div class={styles.message}>
                      <strong>{message().subject}</strong>
                      <Show when={message().body}>
                        <span>{message().body}</span>
                      </Show>
                    </div>
                    <div class={styles.metadata}>
                      <span>{commit.author}</span>
                      <span aria-hidden="true">·</span>
                      <time dateTime={commit.authoredAt}>
                        {relativeTime(commit.authoredAt, props.now?.() ?? new Date())}
                      </time>
                      <code>{shortCommitId(commit.id)}</code>
                    </div>
                  </div>
                </li>
              );
            }}
          </For>
        </ol>
      </Show>
      <Show when={error()}>{(message) => <p class={styles.error}>Could not load commit history: {message()}</p>}</Show>
      <Show when={started() && commits().length === 0 && !loading() && !error()}>
        <p class={styles.empty}>No commits found</p>
      </Show>
      <Show when={loading()}>
        <p class={styles.status}>Loading commits…</p>
      </Show>
      <Show when={!loading() && cursor()}>
        {(nextCursor) => (
          <button class={styles.loadMore} type="button" onClick={() => void load(nextCursor())}>
            Load older commits
          </button>
        )}
      </Show>
    </section>
  );
}

function CommitGraph(props: { readonly row: GitHistoryGraphRow }) {
  const [height, setHeight] = createSignal(64);
  let graph: HTMLDivElement | undefined;
  onMount(() => {
    const observer = new ResizeObserver(([entry]) => setHeight(Math.max(64, entry.contentRect.height)));
    if (graph) observer.observe(graph);
    onCleanup(() => observer.disconnect());
  });
  const width = () => props.row.laneCount * laneWidth + graphPadding * 2;
  return (
    <div ref={graph} class={styles.graph} style={{ width: `${width()}px` }} aria-hidden="true">
      <svg viewBox={`0 0 ${width()} ${height()}`} preserveAspectRatio="none">
        <For each={props.row.lines}>
          {(line) => (
            <path
              class={`${styles.line} ${styles[`color${line.color % 6}`]}`}
              d={trackPath(line.fromLane, line.toLane, line.from, line.to, height())}
            />
          )}
        </For>
        <circle
          class={`${styles.bubble} ${styles[`color${props.row.color % 6}`]}`}
          cx={graphPadding + props.row.lane * laneWidth}
          cy="20"
          r="5"
        />
      </svg>
    </div>
  );
}

function trackPath(
  fromLane: number,
  toLane: number,
  from: "top" | "commit",
  to: "commit" | "bottom",
  height: number,
): string {
  const fromX = graphPadding + fromLane * laneWidth;
  const toX = graphPadding + toLane * laneWidth;
  const fromY = from === "top" ? -1 : 20;
  const toY = to === "commit" ? 20 : height + 1;
  const distance = toY - fromY;
  return `M ${fromX} ${fromY} C ${fromX} ${fromY + distance * 0.45}, ${toX} ${toY - distance * 0.45}, ${toX} ${toY}`;
}

function splitMessage(message: string): { subject: string; body?: string } {
  const [subject = "", ...body] = message.trim().split("\n");
  const detail = body.join("\n").trim();
  return { subject, body: detail || undefined };
}

export function shortCommitId(id: string): string {
  return id.slice(0, 8);
}

export function relativeTime(value: string, now: Date): string {
  const deltaSeconds = Math.round((new Date(value).getTime() - now.getTime()) / 1_000);
  const units = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ] as const;
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  for (const [unit, seconds] of units) {
    if (Math.abs(deltaSeconds) >= seconds) return formatter.format(Math.round(deltaSeconds / seconds), unit);
  }
  return formatter.format(deltaSeconds, "second");
}
