import { FileDiff, parsePatchFiles, type FileDiffMetadata } from "@pierre/diffs";
import { createMemo, For, onCleanup, onMount, Show } from "solid-js";

import styles from "./CommitReviewView.module.css";

/** Renders every text-file change in a unified Git patch. */
export function CommitDiff(props: { readonly patch: string }) {
  const files = createMemo(() => parsePatchFiles(props.patch).flatMap((parsed) => parsed.files));
  return (
    <div class={styles.diffList}>
      <Show when={files().length > 0} fallback={<p class={styles.empty}>This commit has no text-file changes.</p>}>
        <For each={files()}>{(file) => <DiffFile file={file} />}</For>
      </Show>
    </div>
  );
}

function DiffFile(props: { readonly file: FileDiffMetadata }) {
  let container: HTMLDivElement | undefined;
  let renderer: FileDiff | undefined;
  onMount(() => {
    renderer = new FileDiff();
    renderer.render({ fileDiff: props.file, fileContainer: container });
  });
  onCleanup(() => renderer?.cleanUp());
  return <div ref={container} class={styles.diffFile} />;
}
