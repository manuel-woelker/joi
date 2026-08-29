import { fetchService, type FetchService } from "../services/fetch-service";
import type { QueryDefinition, Ticket, TicketField, TicketStatus } from "./model";

interface TicketQueryColumn {
  attribute: string;
  values: {
    type: "string";
    values: string[];
  };
}

interface TicketQueryResponse {
  number_of_hits: number;
  result_columns: TicketQueryColumn[];
}

const requestedAttributes = ["*"] as const;
const ticketAttributes: TicketField[] = ["id", "key", "title", "description", "status"];
const ticketStatuses = new Set<TicketStatus>(["open", "in-progress", "closed"]);

export async function loadTickets(service: FetchService = fetchService, query?: QueryDefinition): Promise<Ticket[]> {
  const payload = await service.post("/api/query", {
    table_name: "tickets",
    criterion: queryCriterion(query),
    max_results: 100,
    attributes: requestedAttributes,
  });
  if (!isTicketQueryResponse(payload)) {
    throw new Error("Ticket query returned an invalid response");
  }
  const columns = new Map(payload.result_columns.map((column) => [column.attribute, column.values.values]));
  const rowCount = Math.min(
    payload.number_of_hits,
    ...ticketAttributes.map((attribute) => columns.get(attribute)?.length ?? 0),
  );

  return Array.from({ length: rowCount }, (_, index) => {
    const status = columns.get("status")![index];
    if (!ticketStatuses.has(status as TicketStatus)) {
      throw new Error(`Ticket query returned unsupported status ${status}`);
    }
    return {
      id: columns.get("id")![index],
      key: columns.get("key")![index],
      title: columns.get("title")![index],
      description: columns.get("description")![index],
      status: status as TicketStatus,
    };
  });
}

type QueryCriterionRequest =
  | "match_any"
  | { not: { equals: { attribute: TicketField; values: string[] } } }
  | { equals: { attribute: TicketField; values: string[] } };

function queryCriterion(query: QueryDefinition | undefined): QueryCriterionRequest {
  const filter = query?.filters.length === 1 ? query.filters[0] : undefined;
  if (!filter || filter.operator === "contains") return "match_any";
  const values = Array.isArray(filter.value) ? filter.value : [filter.value];
  const equals = { equals: { attribute: filter.field, values } } as const;
  return filter.operator === "not-equals" ? { not: equals } : equals;
}

function isTicketQueryResponse(value: unknown): value is TicketQueryResponse {
  if (!value || typeof value !== "object") return false;
  const response = value as Partial<TicketQueryResponse>;
  return (
    typeof response.number_of_hits === "number" &&
    Array.isArray(response.result_columns) &&
    response.result_columns.every(
      (column) =>
        !!column &&
        typeof column.attribute === "string" &&
        column.values?.type === "string" &&
        Array.isArray(column.values.values) &&
        column.values.values.every((item) => typeof item === "string"),
    ) &&
    ticketAttributes.every((attribute) => response.result_columns!.some((column) => column.attribute === attribute))
  );
}
