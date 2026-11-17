import { defineEntity, Types } from "../src/entity-definition.ts";

export const bookType = defineEntity({
  name: "Book",
  attributes: [
    { name: "Title", type: Types.String },
    { name: "Published", type: Types.Date },
  ],
});

export const shelfType = defineEntity({
  name: "Shelf",
  attributes: [
    { name: "Books", type: Types.set(Types.ref(bookType)) },
    { name: "Loan Period", type: Types.DateRange },
  ],
});
