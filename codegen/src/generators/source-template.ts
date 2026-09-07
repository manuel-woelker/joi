/** Builds source text from an indented template without retaining its shared margin. */
export function source(strings: TemplateStringsArray, ...values: readonly unknown[]): string {
  let result = strings[0];
  for (const [index, value] of values.entries()) {
    const indentation = result.match(/(?:^|\n)([ \t]*)$/)?.[1] ?? "";
    result += String(value).replaceAll("\n", `\n${indentation}`) + strings[index + 1];
  }

  const lines = result
    .replace(/^\n/, "")
    .replace(/\n[ \t]*$/, "")
    .split("\n");
  const margins = lines.filter((line) => line.trim()).map((line) => line.match(/^[ \t]*/)?.[0].length ?? 0);
  const margin = Math.min(...margins);
  return lines.map((line) => line.slice(Math.min(margin, line.length))).join("\n");
}
