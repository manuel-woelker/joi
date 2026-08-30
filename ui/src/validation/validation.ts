/** A validation rule that may add failures for a value. */
export type ValidationFunction<T> = (validationContext: ValidationContext<T>) => void;

/** Context supplied to a validation rule. */
export interface ValidationContext<T> {
  /** Value being validated. */
  readonly value: T;
  /** Adds one validation failure to the current result. */
  addValidationFailure(validationFailure: ValidationFailure): void;
}

/** One user-facing validation message, optionally associated with an attribute. */
export interface ValidationFailure {
  /** Attribute the failure belongs to. Omit for a value-level failure. */
  readonly attribute?: string;
  /** User-facing explanation of the failed rule. */
  readonly message: string;
}

/** Result produced by running validation rules. */
export interface ValidationResult {
  /** Failures in rule execution order. */
  readonly failures: readonly ValidationFailure[];
}

/** Runs a validation function against a value and collects its failures. */
export function validate<T>(value: T, validation: ValidationFunction<T>): ValidationResult {
  const failures: ValidationFailure[] = [];
  const context: ValidationContext<T> = {
    value,
    addValidationFailure(failure) {
      failures.push(failure);
    },
  };
  validation(context);
  return { failures };
}
