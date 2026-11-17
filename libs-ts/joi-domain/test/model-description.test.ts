import assert from "node:assert/strict";
import { test } from "node:test";

import { defineEntity, isEntityType, Types } from "../src/entity-definition.ts";
import { describeModel } from "../src/model-description.ts";
import { bookType, shelfType } from "./example-model.ts";

test("serializes nested references by entity name", () => {
  assert.deepEqual(describeModel([shelfType, bookType]), {
    version: 1,
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
