import { executeDataQuery, type QueryCriterionRequest } from "../query/query-client";
import type { QueryResult } from "../query/query-result";
import { fetchService, type FetchService } from "../../../base/services/fetch-service";
import type { EntityDescription } from "../entities/entity-description";
import type { FilterDefinition } from "../../../components/filter-definition/filter-model";
import type { QueryDefinition } from "./model";

type EntityQuery = Pick<QueryDefinition, "filter"> & {
  readonly sorting?: readonly (
    | QueryDefinition["sorting"][number]
    | { readonly attribute: string; readonly direction: "ascending" | "descending" }
  )[];
};

export function loadEntityRecords(
  entity: EntityDescription,
  service: FetchService = fetchService,
  query?: EntityQuery,
): Promise<QueryResult> {
  return executeDataQuery(service, {
    tableName: entity.tableName,
    criterion: queryCriterion(query),
    sorting: (query?.sorting ?? []).map((sort) => ({
      attribute: "attribute" in sort ? sort.attribute : sort.field,
      direction: sort.direction,
    })),
    maxResults: 100,
    attributes: ["*"],
    returnTotalCount: true,
  });
}

function queryCriterion(query: Pick<QueryDefinition, "filter"> | undefined): QueryCriterionRequest {
  return filterCriterion(query?.filter) ?? "match_any";
}

function filterCriterion(filter: FilterDefinition | undefined): QueryCriterionRequest | undefined {
  if (!filter || filter.disabled) return undefined;
  if (filter.type === "composite") {
    const children = filter.children.flatMap((child) => {
      const criterion = filterCriterion(child);
      return criterion ? [criterion] : [];
    });
    if (filter.kind === "all") return { all: children };
    if (filter.kind === "one") return { one: children };
    return { none: children };
  }
  if (filter.operator === "set") return { set: { attribute: filter.attribute } };
  if (filter.operator === "unset") return { unset: { attribute: filter.attribute } };
  if (filter.operator === "in-range" && filter.operand?.type === "range") {
    return {
      in_range: {
        attribute: filter.attribute,
        minimum: filter.operand.minimum === undefined ? undefined : String(filter.operand.minimum),
        maximum: filter.operand.maximum === undefined ? undefined : String(filter.operand.maximum),
      },
    };
  }
  const values =
    filter.operand?.type === "set"
      ? filter.operand.values.map(String)
      : filter.operand?.type === "value"
        ? [String(filter.operand.value)]
        : [];
  if (filter.operator === "less-than" && values[0] !== undefined) {
    return { less_than: { attribute: filter.attribute, value: values[0] } };
  }
  if (filter.operator === "contains" && values[0] !== undefined) {
    return { contains: { attribute: filter.attribute, value: values[0] } };
  }
  if (!values.length) return undefined;
  const equals = { equals: { attribute: filter.attribute, values } } as const;
  if (filter.operator === "not-equals") return { not: equals };
  return filter.operator === "equals" || filter.operator === "in-set" ? equals : undefined;
}
