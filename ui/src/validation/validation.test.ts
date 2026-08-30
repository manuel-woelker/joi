import { describe, expect, it } from "vitest";

import { matches, notEmpty } from "./validation-functions";
import { validate } from "./validation";

describe("validation", () => {
  it("collects failures from multiple rules in order", () => {
    const validatePresent = notEmpty("Value is required.");
    const validateFormat = matches(/^[A-Z]+-\d+$/, "Use PROJECT-123.");
    const result = validate("  ", (context) => {
      validatePresent(context);
      validateFormat(context);
    });

    expect(result.failures).toEqual([{ message: "Value is required." }, { message: "Use PROJECT-123." }]);
  });

  it("accepts non-empty and matching fields", () => {
    const validatePresent = notEmpty();
    const validateFormat = matches(/^[A-Z]+-\d+$/);
    const result = validate("TEST-123", (context) => {
      validatePresent(context);
      validateFormat(context);
    });
    expect(result.failures).toEqual([]);
  });

  it("does not retain state from global regular expressions", () => {
    const validation = matches(/^[A-Z]+$/g);
    expect(validate("ABC", validation).failures).toEqual([]);
    expect(validate("ABC", validation).failures).toEqual([]);
  });
});
