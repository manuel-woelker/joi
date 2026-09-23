import { executeCountQuery, executeDataQuery, type QueryCriterionRequest } from "../query/query-client";
import type { QueryAggregateResult, QueryResult, QueryValue } from "../query/query-result";
import { fetchService, type FetchService } from "../../../base/services/fetch-service";
import type { EntityDescription } from "../entities/entity-description";
import type { FilterDefinition } from "../../../components/filter-definition/filter-model";
import type { QueryDefinition } from "./model";

type EntityQuery = Pick<QueryDefinition, "filter"> & {
  readonly sorting?: readonly (
    | QueryDefinition["sorting"][number]
    | { readonly attribute: string; readonly direction: "ascending" | "descending" }
  )[];
  readonly facets?: readonly FacetSelection[];
  /** Quicksearch term matched against every attribute through a term criterion. */
  readonly search?: string;
  /** Per-column quicksearch terms, each scoped to its attribute. */
  readonly columnSearch?: Readonly<Record<string, string>>;
};

export interface FacetSelection {
  readonly attribute: string;
  readonly value: QueryValue | null;
  readonly state: "included" | "excluded";
}

/** Attributes constrained by effective criteria or column searches, excluding facets. */
export function filteredEntityAttributes(query: EntityQuery): ReadonlySet<string> {
  const attributes = new Set<string>();
  const visit = (filter: FilterDefinition) => {
    if (filter.disabled) return;
    if (filter.type === "composite") {
      filter.children.forEach(visit);
    } else if (filterCriterion(filter)) {
      attributes.add(filter.attribute);
    }
  };
  if (query.filter) visit(query.filter);
  for (const [attribute, term] of Object.entries(query.columnSearch ?? {})) {
    if (term.trim()) attributes.add(attribute);
  }
  return attributes;
}

export function loadEntityRecords(
  entity: EntityDescription,
  service: FetchService = fetchService,
  query?: EntityQuery,
): Promise<QueryResult> {
  return executeDataQuery(service, queryRequest(entity, query));
}

/** Loads the total matching row count independently from row data. */
export async function loadEntityRecordCount(
  entity: EntityDescription,
  service: FetchService = fetchService,
  query?: EntityQuery,
): Promise<number> {
  const aggregate = await executeCountQuery(service, {
    tableName: entity.tableName,
    criterion: queryCriterion(query),
    maxResults: 1,
  });
  return aggregate.values[0]?.count ?? 0;
}

/** Loads one facet independently, excluding only its own facet selections. */
export function loadEntityFacet(
  entity: EntityDescription,
  attribute: string,
  service: FetchService = fetchService,
  query?: EntityQuery,
): Promise<QueryAggregateResult> {
  return executeCountQuery(service, {
    tableName: entity.tableName,
    criterion: queryCriterion(query, attribute),
    attribute,
    maxResults: 100,
  });
}

function queryRequest(entity: EntityDescription, query: EntityQuery | undefined) {
  return {
    tableName: entity.tableName,
    criterion: queryCriterion(query),
    sorting: (query?.sorting ?? []).map((sort) => ({
      attribute: "attribute" in sort ? sort.attribute : sort.field,
      direction: sort.direction,
    })),
    maxResults: 1000,
    attributes: ["*"],
  } as const;
}

function queryCriterion(query: EntityQuery | undefined, excludedFacetAttribute?: string): QueryCriterionRequest {
  const criteria: QueryCriterionRequest[] = [];
  const search = query?.search?.trim();
  if (search) criteria.push({ term: { value: search } });
  for (const [attribute, term] of Object.entries(query?.columnSearch ?? {})) {
    const value = term.trim();
    if (value) criteria.push({ term: { value, attributes: [attribute] } });
  }
  const base = filterCriterion(query?.filter);
  if (base) criteria.push(base);
  const facets = new Map<string, FacetSelection[]>();
  for (const selection of query?.facets ?? []) {
    if (selection.attribute === excludedFacetAttribute) continue;
    const entries = facets.get(selection.attribute) ?? [];
    entries.push(selection);
    facets.set(selection.attribute, entries);
  }
  for (const [attribute, selections] of facets) {
    const included = selections.filter((selection) => selection.state === "included");
    if (included.length) {
      const values = included
        .filter((selection) => selection.value !== null)
        .map((selection) => String(selection.value));
      const choices: QueryCriterionRequest[] = values.length ? [{ equals: { attribute, values } }] : [];
      if (included.some((selection) => selection.value === null)) choices.push({ unset: { attribute } });
      criteria.push(choices.length === 1 ? choices[0] : { one: choices });
    }
    for (const excluded of selections.filter((selection) => selection.state === "excluded")) {
      const criterion: QueryCriterionRequest =
        excluded.value === null
          ? { unset: { attribute } }
          : { equals: { attribute, values: [String(excluded.value)] } };
      criteria.push({ not: criterion });
    }
  }
  if (criteria.length === 0) return "match_any";
  return criteria.length === 1 ? criteria[0] : { all: criteria };
}

function filterCriterion(filter: FilterDefinition | undefined): QueryCriterionRequest | undefined {
  if (!filter || filter.disabled) return undefined;
  if (filter.type === "composite") {
    const children = filter.children.flatMap((child) => {
      const criterion = filterCriterion(child);
      return criterion ? [criterion] : [];
    });
    if (!children.length) return undefined;
    if (children.length === 1 && filter.kind !== "none") return children[0];
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
