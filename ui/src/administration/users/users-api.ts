import { fetchService, type FetchService } from "../../services/fetch-service";

export interface User {
  readonly username: string;
  readonly name: string;
}

interface UserQueryResponse {
  number_of_hits: number;
  result_columns: Array<{
    attribute: string;
    values: { type: "string"; values: string[] };
  }>;
}

const requestedAttributes = ["username", "name"] as const;

export async function loadUsers(service: FetchService = fetchService): Promise<User[]> {
  const payload = await service.post("/api/query", {
    table_name: "users",
    criterion: "match_any",
    max_results: 100,
    attributes: requestedAttributes,
  });
  if (!isUserQueryResponse(payload)) throw new Error("User query returned an invalid response");

  const columns = new Map(payload.result_columns.map((column) => [column.attribute, column.values.values]));
  const rowCount = Math.min(
    payload.number_of_hits,
    ...requestedAttributes.map((attribute) => columns.get(attribute)!.length),
  );
  return Array.from({ length: rowCount }, (_, index) => ({
    username: columns.get("username")![index],
    name: columns.get("name")![index],
  }));
}

function isUserQueryResponse(value: unknown): value is UserQueryResponse {
  if (!value || typeof value !== "object") return false;
  const response = value as Partial<UserQueryResponse>;
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
    requestedAttributes.every((attribute) => response.result_columns!.some((column) => column.attribute === attribute))
  );
}
