import type { ValidationFunction } from "./validation";

/** Creates a validation requiring a string to contain non-whitespace text. */
export function notEmpty(message = "Value must not be empty."): ValidationFunction<string> {
  return ({ value, addValidationFailure }) => {
    if ((value ?? "").trim() === "") addValidationFailure({ message });
  };
}

/** Creates a validation requiring a string to match a regular expression. */
export function matches(pattern: RegExp, message = "Value has an invalid format."): ValidationFunction<string> {
  return ({ value, addValidationFailure }) => {
    const expression = new RegExp(pattern.source, pattern.flags);
    if (!expression.test(value ?? "")) addValidationFailure({ message });
  };
}
