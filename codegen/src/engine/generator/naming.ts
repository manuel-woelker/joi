export function pascalCase(value: string): string {
  return value
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join("");
}

export function camelCase(value: string): string {
  const pascal = pascalCase(value);
  return `${pascal[0]?.toLowerCase() ?? ""}${pascal.slice(1)}`;
}

export function snakeCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

export function assertUniqueNames(
  values: readonly string[],
  category: string,
  transform: (value: string) => string,
): void {
  const generated = new Map<string, string>();
  for (const value of values) {
    const name = transform(value);
    const previous = generated.get(name);
    if (previous && previous !== value) {
      throw new Error(`${category} '${value}' and '${previous}' both generate the name '${name}'`);
    }
    generated.set(name, value);
  }
}
