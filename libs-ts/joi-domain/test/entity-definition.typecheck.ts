import { defineEnum, type EntityType, type EnumType, Types } from "../src/entity-definition.ts";
import { bookType, shelfType } from "./example-model.ts";

const acceptsBook = (entity: EntityType<"Book">) => entity;

acceptsBook(bookType);
// @ts-expect-error A different entity name is not a Book reference.
acceptsBook(shelfType);
// @ts-expect-error A plain object does not carry the entity reference brand.
acceptsBook({ name: "Book", attributes: bookType.attributes });

const method = defineEnum({ name: "Method", values: [{ name: "verbal" }, { name: "written" }] });
const acceptsMethod = (enumeration: EnumType<"Method">) => enumeration;
acceptsMethod(method);
Types.enumeration(method);
// @ts-expect-error A plain object does not carry the enum reference brand.
acceptsMethod({ name: "Method", values: method.values });
