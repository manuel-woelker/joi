import assert from "node:assert/strict";
import { test } from "node:test";
import { Types } from "../src/entity-definition.ts";
import { bookType, shelfType } from "./example-model.ts";

test("defineEntity retains names, attributes, and reference identity", () => {
  assert.equal(bookType.name, "Book");
  assert.equal(bookType.attributes[0].type.kind, "string");
  assert.equal(bookType.attributes[1].type.kind, "date");
  assert.strictEqual(shelfType.attributes[0].type.element.entity, bookType);
  assert.equal(shelfType.attributes[1].type.kind, "date-range");
});

test("defineEntity returns a branded reference accepted by Types.ref", () => {
  assert.equal(Object.getOwnPropertySymbols(bookType).length, 1);
  assert.strictEqual(Types.ref(bookType).entity, bookType);
});
