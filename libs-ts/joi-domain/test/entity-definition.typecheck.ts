import type { EntityType } from "../src/entity-definition.ts";
import { bookType, shelfType } from "./example-model.ts";

const acceptsBook = (entity: EntityType<"Book">) => entity;

acceptsBook(bookType);
// @ts-expect-error A different entity name is not a Book reference.
acceptsBook(shelfType);
// @ts-expect-error A plain object does not carry the entity reference brand.
acceptsBook({ name: "Book", attributes: bookType.attributes });
