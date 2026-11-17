import assert from "node:assert/strict";
import { test } from "node:test";

import { defineEntity, defineEnum, isEntityType, isEnumType, Types } from "../src/entity-definition.ts";
import { describeModel } from "../src/model-description.ts";
import { bookType, shelfType } from "./example-model.ts";

test("serializes nested references by entity name", () => {
  assert.deepEqual(describeModel([shelfType, bookType]), {
    version: 1,
    enums: [],
    entities: [
      {
        name: "Book",
        attributes: [
          { name: "Title", type: { kind: "string" } },
          { name: "Published", type: { kind: "date" } },
        ],
      },
      {
        name: "Shelf",
        attributes: [
          { name: "Books", type: { kind: "set", element: { kind: "ref", entity: "Book" } } },
          { name: "Loan Period", type: { kind: "date-range" } },
        ],
      },
    ],
  });
  assert.equal(isEntityType(bookType), true);
  assert.equal(isEntityType({ name: "Book", attributes: [] }), false);
});

test("serializes named enums and validates their values and references", () => {
  const method = defineEnum({
    name: "Method",
    description: "Assessment method.",
    values: [{ name: "verbal" }, { name: "written", description: "On paper." }],
  });
  const assessment = defineEntity({
    name: "Assessment",
    attributes: [{ name: "Method", type: Types.enumeration(method) }],
  });
  assert.equal(isEnumType(method), true);
  assert.equal(isEnumType({ name: "Method", values: [] }), false);
  assert.deepEqual(describeModel([assessment], [method]), {
    version: 1,
    enums: [
      {
        name: "Method",
        description: "Assessment method.",
        values: [{ name: "verbal" }, { name: "written", description: "On paper." }],
      },
    ],
    entities: [{ name: "Assessment", attributes: [{ name: "Method", type: { kind: "enum", enumeration: "Method" } }] }],
  });
  assert.throws(() => describeModel([assessment]), /not exported/);
  assert.throws(() => describeModel([assessment], [method, method]), /Duplicate/);
  assert.throws(() => describeModel([], [defineEnum({ name: "Empty", values: [] })]), /no values/);
  assert.throws(
    () => describeModel([], [defineEnum({ name: "Repeated", values: [{ name: "x" }, { name: "x" }] })]),
    /Duplicate/,
  );
});

test("rejects dangling references and duplicate names", () => {
  assert.throws(() => describeModel([shelfType]), /not exported/);
  assert.throws(() => describeModel([bookType, bookType]), /Duplicate/);
  const duplicateAttributes = defineEntity({
    name: "Invalid",
    attributes: [
      { name: "Name", type: Types.String },
      { name: "Name", type: Types.Date },
    ],
  });
  assert.throws(() => describeModel([duplicateAttributes]), /Duplicate/);
});

test("preserves entity and attribute descriptions", () => {
  const course = defineEntity({
    name: "Course",
    description: "A subject taught to students.",
    attributes: [{ name: "Title", description: "The course title.", type: Types.String }],
  });
  assert.deepEqual(describeModel([course]).entities[0], {
    name: "Course",
    description: "A subject taught to students.",
    attributes: [{ name: "Title", description: "The course title.", type: { kind: "string" } }],
  });
});
