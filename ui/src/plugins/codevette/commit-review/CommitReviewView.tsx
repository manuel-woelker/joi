import GitCommitIcon from "lucide-solid/icons/git-commit-horizontal";
import { createResource, Match, Show, Switch } from "solid-js";

import { useNavigation } from "../../../base/navigation";
import type { FetchService } from "../../../base/services/fetch-service";
import { DateTime } from "../../../components/DateTime";
import type { ReviewCommentSource } from "../../../components/diff-viewer/comment-model";
import { DiffViewer } from "../../../components/diff-viewer/DiffViewer";
import { type TabDefinition, Tabs } from "../../../components/tabs/Tabs";
import type { GitCommitDetails, UserInfo } from "../../../generated/api/api";
import { DataText, ModelText } from "../../../components/SourceText";
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
  const selectedTab = () => {
    const tab = navigation.hashState("tab");
    return tab === "diff" || tab === "comments" ? tab : "summary";
  };
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
                  <h1>
                    <DataText>{subject(details().message)}</DataText>
                  </h1>
                  <code>
                    <DataText>{details().id.slice(0, 8)}</DataText>
                  </code>
                </div>
                <span class={styles.status}>
                  <DataText>{details().status.replaceAll("-", " ")}</DataText>
                </span>
              </header>
              <Tabs
                class={styles.reviewTabs}
                ariaLabel="Commit review"
                tabs={commitTabs(details(), currentUser(), commands)}
                selected={selectedTab()}
                onSelect={(id) => navigation.setHashState("tab", id === "summary" ? undefined : id)}
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
                <dt>
                  <ModelText>Author</ModelText>
                </dt>
                <dd>
                  <DataText>{details.author}</DataText>
                </dd>
              </div>
              <div>
                <dt>
                  <ModelText>Authored</ModelText>
                </dt>
                <dd>
                  <DateTime value={details.authoredAt} />
                </dd>
              </div>
              <div>
                <dt>
                  <ModelText>Commit</ModelText>
                </dt>
                <dd>
                  <code>
                    <DataText>{details.id}</DataText>
                  </code>
                </dd>
              </div>
              <div>
                <dt>
                  <ModelText>Parents</ModelText>
                </dt>
                <dd>
                  {details.parentIds.map((id) => (
                    <code>
                      <DataText>{id.slice(0, 8)}</DataText>
                    </code>
                  ))}
                </dd>
              </div>
            </dl>
            <div class={styles.summary}>
              <strong>
                <DataText>{details.filesChanged}</DataText> files
              </strong>
              <span class={styles.added}>
                +<DataText>{details.linesAdded}</DataText>
              </span>
              <span class={styles.deleted}>
                -<DataText>{details.linesDeleted}</DataText>
              </span>
            </div>
            <pre class={styles.message}>
              <DataText>{details.message}</DataText>
            </pre>
          </div>
        </div>
      ),
    },
    {
      id: "comments",
      label: "Comments",
      render: () => (
        <div class={styles.diffPane}>
          <Show when={currentUser} fallback={<p class={styles.loading}>Loading comments…</p>}>
            {(user) => (
              <DiffViewer
                patch={details.patch}
                height="100%"
                mode="comments"
                comments={commentSource(commands, details.id, user().id)}
              />
            )}
          </Show>
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
