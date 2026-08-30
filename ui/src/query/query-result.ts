import { batch, createSignal } from "solid-js";

declare const indexBrand: unique symbol;
const resultBrand: unique symbol = Symbol("query-result-brand");

export type BrandedIndex<TKind extends string> = number & { readonly [indexBrand]: TKind };
export type QueryColumnIndex = BrandedIndex<"query-column">;
export type QueryRowIndex = BrandedIndex<"query-row">;

export type QueryColumnValues =
  | { readonly type: "string"; readonly values: readonly string[] }
  | { readonly type: "int"; readonly values: readonly number[] };

export type QueryValue = string | number;
export type QueryValueType = QueryColumnValues["type"];

export interface QueryResultColumn {
  readonly attribute: string;
  readonly values: QueryColumnValues;
}

export interface QueryResponse {
  readonly number_of_hits: number;
  readonly result_columns: readonly QueryResultColumn[];
}

export interface QueryColumnHandle {
  readonly index: QueryColumnIndex;
  readonly attribute: string;
  readonly type: QueryValueType;
  readonly [resultBrand]: symbol;
}

export interface QueryResultRow {
  readonly index: QueryRowIndex;
  value(column: QueryColumnHandle): QueryValue | undefined;
}

export interface QueryValueUpdate {
  readonly column: QueryColumnHandle;
  readonly value: QueryValue;
}

export interface QueryResult {
  readonly numberOfHits: number;
  readonly columns: readonly QueryColumnHandle[];
  readonly rows: readonly QueryResultRow[];
  column(attribute: string): QueryColumnHandle | undefined;
  requireColumn(attribute: string): QueryColumnHandle;
  updateRow(row: QueryResultRow, updates: readonly QueryValueUpdate[]): void;
}

const queryColumnIndex = (value: number): QueryColumnIndex => value as QueryColumnIndex;
const queryRowIndex = (value: number): QueryRowIndex => value as QueryRowIndex;

export function parseQueryResponse(value: unknown): QueryResult {
  const response = validateResponse(value);
  const identity = Symbol("query-result");
  const columns = response.result_columns.map(
    (column, index): QueryColumnHandle => ({
      index: queryColumnIndex(index),
      attribute: column.attribute,
      type: column.values.type,
      [resultBrand]: identity,
    }),
  );
  const columnsByAttribute = new Map(columns.map((column) => [column.attribute, column]));
  const rowCount = response.result_columns[0]?.values.values.length ?? 0;
  const cells = response.result_columns.map((column) =>
    column.values.values.map((value) => createSignal<QueryValue>(value)),
  );
  const rows = Array.from({ length: rowCount }, (_, index): QueryResultRow => {
    const rowIndex = queryRowIndex(index);
    return {
      index: rowIndex,
      value(column) {
        if (column[resultBrand] !== identity) throw new Error("Query column belongs to a different result");
        return cells[column.index]?.[rowIndex]?.[0]();
      },
    };
  });

  return {
    numberOfHits: response.number_of_hits,
    columns,
    rows,
    column: (attribute) => columnsByAttribute.get(attribute),
    requireColumn(attribute) {
      const column = columnsByAttribute.get(attribute);
      if (!column) throw new Error(`Query result does not contain attribute ${attribute}`);
      return column;
    },
    updateRow(row, updates) {
      if (rows[row.index] !== row) throw new Error("Query row belongs to a different result");
      for (const update of updates) {
        if (update.column[resultBrand] !== identity) throw new Error("Query column belongs to a different result");
        if (!isValueOfType(update.value, update.column.type)) {
          throw new Error(`Query value for ${update.column.attribute} must be ${update.column.type}`);
        }
      }
      batch(() => {
        for (const update of updates) cells[update.column.index][row.index][1](() => update.value);
      });
    },
  };
}

function isValueOfType(value: QueryValue, type: QueryValueType): boolean {
  return type === "string" ? typeof value === "string" : Number.isSafeInteger(value);
}

function validateResponse(value: unknown): QueryResponse {
  if (!value || typeof value !== "object") throw new Error("Query returned an invalid response");
  const response = value as Partial<QueryResponse>;
  if (!Number.isSafeInteger(response.number_of_hits) || response.number_of_hits! < 0) {
    throw new Error("Query response has an invalid number_of_hits");
  }
  if (!Array.isArray(response.result_columns)) throw new Error("Query response has invalid result_columns");

  const attributes = new Set<string>();
  let rowCount: number | undefined;
  for (const candidate of response.result_columns) {
    if (!candidate || typeof candidate !== "object") throw new Error("Query response contains an invalid column");
    const column = candidate as Partial<QueryResultColumn>;
    if (typeof column.attribute !== "string" || !column.attribute) {
      throw new Error("Query response contains an invalid attribute");
    }
    if (attributes.has(column.attribute))
      throw new Error(`Query response contains duplicate attribute ${column.attribute}`);
    attributes.add(column.attribute);
    if (!isColumnValues(column.values))
      throw new Error(`Query response contains invalid values for ${column.attribute}`);
    const length = column.values.values.length;
    if (rowCount !== undefined && length !== rowCount) throw new Error("Query response columns have unequal lengths");
    rowCount = length;
  }
  return response as QueryResponse;
}

function isColumnValues(value: unknown): value is QueryColumnValues {
  if (!value || typeof value !== "object") return false;
  const values = value as Partial<QueryColumnValues>;
  if (!Array.isArray(values.values)) return false;
  if (values.type === "string") return values.values.every((item) => typeof item === "string");
  if (values.type === "int") return values.values.every((item) => Number.isSafeInteger(item));
  return false;
}
