import parseDiff from "parse-diff";

import { diffFileId, diffRowId, type DiffDocument, type DiffFile, type DiffLine } from "./diff-model";

/** Converts a Git patch into renderer-owned normalized data. */
export function parsePatch(patch: string): DiffDocument {
  if (!patch.trim()) return { files: [], filesById: new Map() };
  validateHunkCounts(patch);
  let parsed: ReturnType<typeof parseDiff>;
  try {
    parsed = parseDiff(patch);
  } catch (reason) {
    throw new Error(`Unable to parse patch: ${reason instanceof Error ? reason.message : String(reason)}`);
  }

  const blocks = patch.split(/(?=^diff --git )/m).filter(Boolean);
  const files = parsed.map((file, fileIndex): DiffFile => {
    const block = blocks[fileIndex] ?? "";
    const oldPath = cleanPath(file.from);
    const newPath = cleanPath(file.to);
    const displayPath = newPath ?? oldPath ?? `file-${fileIndex + 1}`;
    const id = diffFileId(`${fileIndex}:${oldPath ?? ""}->${newPath ?? ""}`);
    const binary = /^(Binary files .* differ|GIT binary patch)$/m.test(block);
    const renamed = /^(rename from|rename to) /m.test(block) || Boolean(oldPath && newPath && oldPath !== newPath);
    const modeOnly = file.chunks.length === 0 && /^(old mode|new mode) /m.test(block);
    return {
      id,
      oldPath,
      newPath,
      displayPath,
      status: binary
        ? "binary"
        : modeOnly
          ? "mode"
          : file.new
            ? "added"
            : file.deleted
              ? "deleted"
              : renamed
                ? "renamed"
                : "modified",
      additions: file.additions,
      deletions: file.deletions,
      hunks: file.chunks.map((chunk, hunkIndex) => ({
        id: diffRowId(`${id}:hunk:${hunkIndex}`),
        header: chunk.content,
        lines: chunk.changes
          .filter((change) => change.content !== "\\ No newline at end of file")
          .map((change, lineIndex): DiffLine => {
            const kind = change.type === "add" ? "addition" : change.type === "del" ? "deletion" : "context";
            return {
              id: diffRowId(`${id}:hunk:${hunkIndex}:line:${lineIndex}`),
              kind,
              oldLine: change.type === "normal" ? change.ln1 : change.type === "del" ? change.ln : undefined,
              newLine: change.type === "normal" ? change.ln2 : change.type === "add" ? change.ln : undefined,
              content: change.content.slice(1),
            };
          }),
      })),
    };
  });
  return { files: files.map((file) => file.id), filesById: new Map(files.map((file) => [file.id, file])) };
}

function cleanPath(path: string | undefined): string | undefined {
  if (!path || path === "/dev/null") return undefined;
  return path.replace(/^[ab]\//, "");
}

function validateHunkCounts(patch: string): void {
  const lines = patch.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(lines[index]);
    if (!match) continue;
    let oldCount = 0;
    let newCount = 0;
    for (
      index += 1;
      index < lines.length && !lines[index].startsWith("@@ ") && !lines[index].startsWith("diff --git ");
      index += 1
    ) {
      const marker = lines[index][0];
      if (marker === " " || marker === "-") oldCount += 1;
      if (marker === " " || marker === "+") newCount += 1;
    }
    index -= 1;
    const expectedOld = Number(match[2] ?? 1);
    const expectedNew = Number(match[4] ?? 1);
    if (oldCount !== expectedOld || newCount !== expectedNew) {
      throw new Error(
        `Invalid hunk counts in "${lines[index - oldCount - newCount] ?? match[0]}": expected ${expectedOld}/${expectedNew}, parsed ${oldCount}/${newCount}`,
      );
    }
  }
}
