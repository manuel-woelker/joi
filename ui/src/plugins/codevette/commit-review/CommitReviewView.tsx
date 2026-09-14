import GitCommitIcon from "lucide-solid/icons/git-commit-horizontal";
import { createResource, Match, Show, Switch } from "solid-js";

import { useNavigation } from "../../../base/navigation";
import type { FetchService } from "../../../base/services/fetch-service";
import { DiffViewer } from "../../../components/diff-viewer/DiffViewer";
import type { ReviewCommentSource } from "../../../components/diff-viewer/comment-model";
import { Tabs, type TabDefinition } from "../../../components/tabs/Tabs";
import type { GitCommitDetails, UserInfo } from "../../../generated/api/api";
import { CommandService } from "../../../generated/api/command-service";
import styles from "./CommitReviewView.module.css";

export interface CommitReviewViewProps {
  readonly service: FetchService;
  readonly branchId: string;
  readonly commitId: string;
}

/** Displays commit metadata, its review state, and text-file changes. */
export function CommitReviewView(props: CommitReviewViewProps) {
  const navigation = useNavigation();
  const selectedTab = () => (navigation.hashState("tab") === "diff" ? "diff" : "summary");
  const commands = new CommandService(props.service);
  const [commit] = createResource(
    () => ({ branchId: props.branchId, commitId: props.commitId }),
    (request) => commands.codevetteCommit(request),
  );
  const [currentUser] = createResource(() => commands.userInfo({}));
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
              <Tabs
                class={styles.reviewTabs}
                ariaLabel="Commit review"
                tabs={commitTabs(details(), currentUser(), commands)}
                selected={selectedTab()}
                onSelect={(id) => navigation.setHashState("tab", id === "diff" ? "diff" : undefined)}
              />
            </>
          )}
        </Match>
      </Switch>
    </section>
  );
}

function commitTabs(
  details: GitCommitDetails,
  currentUser: UserInfo | undefined,
  commands: CommandService,
): readonly TabDefinition[] {
  return [
    {
      id: "summary",
      label: "Summary",
      render: () => (
        <div class={styles.overviewPane}>
          <div class={styles.overview}>
            <dl class={styles.metadata}>
              <div>
                <dt>Author</dt>
                <dd>{details.author}</dd>
              </div>
              <div>
                <dt>Authored</dt>
                <dd>
                  <time dateTime={details.authoredAt}>{new Date(details.authoredAt).toLocaleString()}</time>
                </dd>
              </div>
              <div>
                <dt>Commit</dt>
                <dd>
                  <code>{details.id}</code>
                </dd>
              </div>
              <div>
                <dt>Parents</dt>
                <dd>
                  {details.parentIds.map((id) => (
                    <code>{id.slice(0, 8)}</code>
                  ))}
                </dd>
              </div>
            </dl>
            <div class={styles.summary}>
              <strong>{details.filesChanged} files</strong>
              <span class={styles.added}>+{details.linesAdded}</span>
              <span class={styles.deleted}>-{details.linesDeleted}</span>
            </div>
            <pre class={styles.message}>{details.message}</pre>
          </div>
        </div>
      ),
    },
    {
      id: "diff",
      label: "Diff",
      render: () => (
        <div class={styles.diffPane}>
          <Show when={currentUser} fallback={<p class={styles.loading}>Loading comments…</p>}>
            {(user) => (
              <DiffViewer
                patch={details.patch}
                height="100%"
                comments={commentSource(commands, details.id, user().id)}
              />
            )}
          </Show>
        </div>
      ),
    },
  ];
}

function subject(message: string) {
  return message.split(/\r?\n/, 1)[0] || "Commit";
}

function commentSource(commands: CommandService, commitId: string, currentUserId: string): ReviewCommentSource {
  return {
    currentUserId,
    commitId,
    async load() {
      return (await commands.codevetteReviewComments({ commitId })).comments;
    },
    save(request) {
      return commands.codevetteReviewCommentSave({ ...request, commitId });
    },
  };
}
