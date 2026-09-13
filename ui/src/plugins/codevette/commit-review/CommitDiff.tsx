import { parsePatchFiles, type FileDiffMetadata } from "@pierre/diffs";
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import type { ReviewComment, ReviewCommentSaveRequest } from "../../../generated/api/api";
import styles from "./CommitReviewView.module.css";
import { type CommentDraft, DiffRendererController } from "./DiffRendererController";

export interface ReviewCommentSource {
  readonly currentUserId: string;
  load(): Promise<readonly ReviewComment[]>;
  save(request: ReviewCommentSaveRequest): Promise<ReviewComment>;
}

/** Renders text-file changes with optional inline review comments. */
export function CommitDiff(props: { readonly patch: string; readonly comments?: ReviewCommentSource }) {
  const files = createMemo(() => parsePatchFiles(props.patch).flatMap((parsed) => parsed.files));
  const [comments, setComments] = createSignal<readonly ReviewComment[]>([]);
  const [draft, setDraft] = createSignal<CommentDraft>();
  const [error, setError] = createSignal<string>();
  onMount(() => {
    if (props.comments)
      void props.comments
        .load()
        .then(setComments)
        .catch((reason) => setError(String(reason)));
  });
  const save = async (candidate: CommentDraft, comment: string) => {
    if (!props.comments) return;
    try {
      const saved = await props.comments.save({
        id: candidate.editing?.id ?? null,
        commitId: candidate.editing?.commitId ?? "",
        parentId: candidate.editing?.parentId ?? candidate.parentId ?? null,
        file: candidate.file,
        line: candidate.line,
        side: candidate.side,
        comment,
      });
      setComments((current) => [...current.filter((item) => item.id !== saved.id), saved]);
      setDraft(undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };
  return (
    <div class={styles.diffList}>
      <Show when={error()}>{(message) => <p class={styles.error}>{message()}</p>}</Show>
      <Show when={files().length} fallback={<p class={styles.empty}>This commit has no text-file changes.</p>}>
        <For each={files()}>
          {(file) => (
            <DiffFile
              file={file}
              comments={comments()}
              draft={draft()}
              enabled={Boolean(props.comments)}
              currentUserId={props.comments?.currentUserId}
              onSelect={setDraft}
              onSave={save}
              onCancel={() => setDraft(undefined)}
            />
          )}
        </For>
      </Show>
    </div>
  );
}

interface DiffFileProps {
  file: FileDiffMetadata;
  comments: readonly ReviewComment[];
  draft?: CommentDraft;
  enabled: boolean;
  currentUserId?: string;
  onSelect(draft: CommentDraft): void;
  onSave(draft: CommentDraft, text: string): Promise<void>;
  onCancel(): void;
}

function DiffFile(props: DiffFileProps) {
  let wrapper: HTMLDivElement | undefined;
  const controller = new DiffRendererController(props.file, {
    onSelect: props.onSelect,
    onSave: props.onSave,
    onCancel: props.onCancel,
  });
  const state = () => ({
    comments: props.comments,
    draft: props.draft,
    enabled: props.enabled,
    currentUserId: props.currentUserId,
  });
  onMount(() => {
    if (wrapper) controller.mount(wrapper, state());
  });
  createEffect(() => {
    controller.update(state());
  });
  onCleanup(() => controller.dispose());
  return <div ref={wrapper} class={styles.diffFile} />;
}
