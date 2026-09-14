export interface WordDiffFragment {
  readonly text: string;
  readonly changed: boolean;
}

export interface WordDiff {
  readonly deletion: readonly WordDiffFragment[];
  readonly addition: readonly WordDiffFragment[];
}

const maximumTokenCount = 300;

/** Finds unchanged tokens in a paired line and marks the remaining text as changed. */
export function diffWords(deletion: string, addition: string): WordDiff {
  const oldTokens = tokenize(deletion);
  const newTokens = tokenize(addition);
  if (oldTokens.length > maximumTokenCount || newTokens.length > maximumTokenCount) {
    return {
      deletion: [{ text: deletion, changed: true }],
      addition: [{ text: addition, changed: true }],
    };
  }

  const width = newTokens.length + 1;
  const lengths = new Uint16Array((oldTokens.length + 1) * width);
  for (let oldIndex = oldTokens.length - 1; oldIndex >= 0; oldIndex -= 1) {
    for (let newIndex = newTokens.length - 1; newIndex >= 0; newIndex -= 1) {
      const index = oldIndex * width + newIndex;
      lengths[index] =
        oldTokens[oldIndex] === newTokens[newIndex]
          ? lengths[(oldIndex + 1) * width + newIndex + 1] + 1
          : Math.max(lengths[(oldIndex + 1) * width + newIndex], lengths[oldIndex * width + newIndex + 1]);
    }
  }

  const unchangedOld = new Set<number>();
  const unchangedNew = new Set<number>();
  for (let oldIndex = 0, newIndex = 0; oldIndex < oldTokens.length && newIndex < newTokens.length; ) {
    if (oldTokens[oldIndex] === newTokens[newIndex]) {
      unchangedOld.add(oldIndex++);
      unchangedNew.add(newIndex++);
    } else if (lengths[(oldIndex + 1) * width + newIndex] >= lengths[oldIndex * width + newIndex + 1]) {
      oldIndex += 1;
    } else {
      newIndex += 1;
    }
  }

  return {
    deletion: fragments(oldTokens, unchangedOld),
    addition: fragments(newTokens, unchangedNew),
  };
}

function tokenize(value: string): readonly string[] {
  return value.match(/\s+|[\p{L}\p{N}_$]+|[^\s\p{L}\p{N}_$]+/gu) ?? [];
}

function fragments(tokens: readonly string[], unchanged: ReadonlySet<number>): readonly WordDiffFragment[] {
  const result: WordDiffFragment[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const changed = !unchanged.has(index);
    const previous = result.at(-1);
    if (previous?.changed === changed) {
      result[result.length - 1] = { text: previous.text + tokens[index], changed };
    } else {
      result.push({ text: tokens[index], changed });
    }
  }
  return result;
}
