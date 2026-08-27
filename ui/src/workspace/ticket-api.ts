import type { Ticket, TicketField, TicketStatus } from "./model";

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

const requestedAttributes: TicketField[] = ["id", "title", "description", "status"];
const ticketStatuses = new Set<TicketStatus>(["open", "in-progress", "closed"]);

export async function loadTickets(fetcher: typeof fetch = fetch): Promise<Ticket[]> {
  const response = await fetcher("/api/tickets/query", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      criterion: "match_any",
      max_results: 100,
      attributes: requestedAttributes,
    }),
  });
  if (!response.ok) {
    throw new Error(`Ticket query failed with HTTP ${response.status}`);
  }

  const payload: unknown = await response.json();
  if (!isTicketQueryResponse(payload)) {
    throw new Error("Ticket query returned an invalid response");
  }
  const columns = new Map(payload.result_columns.map((column) => [column.attribute, column.values.values]));
  const rowCount = Math.min(payload.number_of_hits, ...requestedAttributes.map((attribute) => columns.get(attribute)?.length ?? 0));

  return Array.from({ length: rowCount }, (_, index) => {
    const status = columns.get("status")![index];
    if (!ticketStatuses.has(status as TicketStatus)) {
      throw new Error(`Ticket query returned unsupported status ${status}`);
    }
    return {
      id: columns.get("id")![index],
      title: columns.get("title")![index],
      description: columns.get("description")![index],
      status: status as TicketStatus,
    };
  });
}

function isTicketQueryResponse(value: unknown): value is TicketQueryResponse {
  if (!value || typeof value !== "object") return false;
  const response = value as Partial<TicketQueryResponse>;
  return typeof response.number_of_hits === "number" && Array.isArray(response.result_columns) &&
    response.result_columns.every((column) =>
      !!column && typeof column.attribute === "string" && column.values?.type === "string" &&
      Array.isArray(column.values.values) && column.values.values.every((item) => typeof item === "string"),
    ) && requestedAttributes.every((attribute) => response.result_columns!.some((column) => column.attribute === attribute));
}
