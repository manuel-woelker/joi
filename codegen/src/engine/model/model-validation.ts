export class ModelValidationError extends Error {
  readonly diagnostics: readonly string[];

  constructor(diagnostics: readonly string[]) {
    super(diagnostics.join("\n"));
    this.name = "ModelValidationError";
    this.diagnostics = diagnostics;
  }
}

export function requireText(value: string, location: string, diagnostics: string[]): void {
  if (value.trim().length === 0) diagnostics.push(`${location} must not be blank`);
}

export function requireIdentifier(value: string, location: string, diagnostics: string[]): void {
  requireText(value, location, diagnostics);
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(value)) diagnostics.push(`${location} '${value}' is not a valid identifier`);
}
