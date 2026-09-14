import { createStore } from "solid-js/store";
import type { ReviewComment } from "../../generated/api/api";
import type { ReviewCommentSource } from "./comment-model";
import type { DiffDocument, DiffFileId, DiffLocation } from "./diff-model";

export type CommentEditor =
  | { readonly kind: "new"; readonly location: DiffLocation; readonly parentId?: string }
  | { readonly kind: "edit"; readonly commentId: string; readonly location: DiffLocation };

export interface DiffViewerState {
  document: DiffDocument;
  fileFilter: string;
  selectedFile?: DiffFileId;
  comments: ReviewComment[];
  editor?: CommentEditor;
  saving: boolean;
  error?: string;
}

export function createDiffViewerStore(document: DiffDocument, source?: ReviewCommentSource) {
  const [state, setState] = createStore<DiffViewerState>({
    document,
    fileFilter: "",
    selectedFile: document.files[0],
    comments: [],
    saving: false,
  });
  const load = async () => {
    if (!source) return;
    try {
      setState("comments", [...(await source.load())]);
    } catch (reason) {
      setState("error", errorMessage(reason));
    }
  };
  const openCommentEdit = (commentId: string) => {
    const comment = state.comments.find((entry) => entry.id === commentId);
    if (!comment) throw new Error(`Unknown comment "${commentId}"`);
    setState("editor", {
      kind: "edit",
      commentId,
      location: { file: comment.file, line: comment.line, side: comment.side },
    });
  };
  const saveComment = async (text: string) => {
    if (!source || !state.editor || !text.trim()) return;
    const editor = state.editor;
    setState({ saving: true, error: undefined });
    const editing = editor.kind === "edit" ? state.comments.find((item) => item.id === editor.commentId) : undefined;
    const request = {
      id: editing?.id ?? null,
      commitId: editing?.commitId ?? source.commitId,
      parentId: editing?.parentId ?? (editor.kind === "new" ? (editor.parentId ?? null) : null),
      ...editor.location,
      comment: text.trim(),
    };
    try {
      const saved = await source.save(request);
      setState("comments", (comments) => [...comments.filter((item) => item.id !== saved.id), saved]);
      setState({ editor: undefined, saving: false });
    } catch (reason) {
      setState({ saving: false, error: errorMessage(reason) });
      throw reason;
    }
  };
  return {
    state,
    load,
    setFileFilter: (value: string) => setState("fileFilter", value),
    selectFile: (id: DiffFileId) => setState("selectedFile", id),
    openCommentEditor: (location: DiffLocation, parentId?: string) =>
      setState("editor", { kind: "new", location, parentId }),
    openCommentEdit,
    cancelCommentEdit: () => setState({ editor: undefined, error: undefined }),
    saveComment,
  };
}

function errorMessage(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason);
}
