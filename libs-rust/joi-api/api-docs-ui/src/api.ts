export interface ApiDocumentation {
  schemaVersion: number;
  module: string;
  models: ApiModel[];
  operations: ApiOperation[];
}

export interface ApiModel {
  name: string;
  description?: string;
  fields: ApiField[];
}

export interface ApiField {
  name: string;
  description?: string;
  type: ApiType;
}

export interface ApiOperation {
  kind: "command" | "query";
  name: string;
  description?: string;
  parameters: ApiField[];
  returns: ApiField[];
}

export interface ApiType {
  name: string;
  arguments: ApiTypeArgument[];
}

export type ApiTypeArgument =
  | { kind: "type"; value: ApiType }
  | { kind: "string"; value: string };

export async function loadApiDocumentation(): Promise<ApiDocumentation> {
  const embedded = document.querySelector<HTMLScriptElement>("#joi-api-data");
  const contents = embedded?.textContent?.trim();

  if (contents && !contents.startsWith("__JOI_API_")) {
    return validate(JSON.parse(contents));
  }

  const response = await fetch("/api.json", {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `API server returned ${response.status}`);
  }

  return validate(await response.json());
}

function validate(value: unknown): ApiDocumentation {
  if (
    typeof value !== "object" ||
    value === null ||
    !("schemaVersion" in value) ||
    !("module" in value) ||
    !("models" in value) ||
    !("operations" in value)
  ) {
    throw new Error("The embedded API documentation has an invalid shape.");
  }

  const candidate = value as Partial<ApiDocumentation>;
  if (
    candidate.schemaVersion !== 1 ||
    typeof candidate.module !== "string" ||
    !Array.isArray(candidate.models) ||
    !Array.isArray(candidate.operations)
  ) {
    throw new Error("The embedded API documentation uses an unsupported schema.");
  }

  return candidate as ApiDocumentation;
}
