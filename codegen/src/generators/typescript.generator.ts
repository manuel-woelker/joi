import { defineGenerator } from "../generation/generated-file.ts";
import type { NamedTypeDefinition, StructDefinition, TypeDefinition } from "../model/definitions.ts";
import { assertUniqueNames, camelCase, pascalCase, snakeCase } from "./naming.ts";

function typeName(type: TypeDefinition): string {
  if (type.kind === "builtin")
    return { boolean: "boolean", integer: "number", json: "unknown", string: "string" }[type.name];
  if (type.kind === "optional") return `${typeName(type.value)} | null`;
  if (type.kind === "list") return `readonly ${typeName(type.value)}[]`;
  return pascalCase(type.id);
}

function doc(description: string): string {
  return `/** ${description.replaceAll("*/", "* /")} */`;
}

function renderType(type: NamedTypeDefinition): string {
  const name = pascalCase(type.id);
  if (type.kind === "alias") return `${doc(type.description)}\nexport type ${name} = ${typeName(type.type)};`;
  if (type.kind === "enum") {
    return `${doc(type.description)}\nexport type ${name} = ${type.values.map((value) => JSON.stringify(value.id)).join(" | ")};`;
  }
  assertUniqueNames(
    type.fields.map((field) => field.id),
    `Fields of ${type.id}`,
    camelCase,
  );
  const fields = type.fields
    .map((field) => `  ${doc(field.description)}\n  readonly ${camelCase(field.id)}: ${typeName(field.type)};`)
    .join("\n");
  return `${doc(type.description)}\nexport interface ${name} {${fields ? `\n${fields}\n` : ""}}`;
}

function encodeExpression(type: TypeDefinition, value: string): string {
  if (type.kind === "optional") return `${value} === null ? null : ${encodeExpression(type.value, value)}`;
  if (type.kind === "list") return `${value}.map((item) => ${encodeExpression(type.value, "item")})`;
  if (type.kind === "alias") return encodeExpression(type.type, value);
  if (type.kind === "struct") return `encode${pascalCase(type.id)}(${value})`;
  return value;
}

function decodeExpression(type: TypeDefinition, value: string): string {
  if (type.kind === "optional") return `${value} === null ? null : ${decodeExpression(type.value, value)}`;
  if (type.kind === "list")
    return `(${value} as readonly unknown[]).map((item) => ${decodeExpression(type.value, "item")})`;
  if (type.kind === "alias") return decodeExpression(type.type, value);
  if (type.kind === "struct") return `decode${pascalCase(type.id)}(${value})`;
  return `${value} as ${typeName(type)}`;
}

function renderEncoder(type: StructDefinition): string {
  const name = pascalCase(type.id);
  const encodedFields = type.fields
    .map(
      (field) =>
        `    ${JSON.stringify(snakeCase(field.id))}: ${encodeExpression(field.type, `value.${camelCase(field.id)}`)},`,
    )
    .join("\n");
  return `function encode${name}(value: ${name}): unknown {
  return {${encodedFields ? `\n${encodedFields}\n  ` : ""}};
}`;
}

function renderDecoder(type: StructDefinition): string {
  const name = pascalCase(type.id);
  const decodedFields = type.fields
    .map(
      (field) =>
        `    ${camelCase(field.id)}: ${decodeExpression(field.type, `object[${JSON.stringify(snakeCase(field.id))}]`)},`,
    )
    .join("\n");
  return `function decode${name}(value: unknown): ${name} {
  const object = value as Record<string, unknown>;
  return {${decodedFields ? `\n${decodedFields}\n  ` : ""}};
}`;
}

function collectStructs(type: TypeDefinition, structs: Set<StructDefinition>): void {
  if (type.kind === "optional" || type.kind === "list") {
    collectStructs(type.value, structs);
  } else if (type.kind === "alias") {
    collectStructs(type.type, structs);
  } else if (type.kind === "struct" && !structs.has(type)) {
    structs.add(type);
    for (const field of type.fields) collectStructs(field.type, structs);
  }
}

export default defineGenerator({
  id: "typescript",
  label: "TypeScript",
  description: "Generate TypeScript API data types and command mappings.",
  generate(model) {
    assertUniqueNames(
      model.types.map((type) => type.id),
      "Type declarations",
      pascalCase,
    );
    const types = model.types.map(renderType).join("\n\n");
    const requests = model.commands
      .map((command) => `  readonly ${JSON.stringify(command.id)}: ${typeName(command.request)};`)
      .join("\n");
    const responses = model.commands
      .map((command) => `  readonly ${JSON.stringify(command.id)}: ${typeName(command.response)};`)
      .join("\n");
    const requestStructs = new Set<StructDefinition>();
    const responseStructs = new Set<StructDefinition>();
    for (const command of model.commands) {
      collectStructs(command.request, requestStructs);
      collectStructs(command.response, responseStructs);
    }
    const codecs = [
      ...[...requestStructs].sort((left, right) => left.id.localeCompare(right.id)).map(renderEncoder),
      ...[...responseStructs].sort((left, right) => left.id.localeCompare(right.id)).map(renderDecoder),
    ].join("\n\n");
    const clientFunctions = model.commands
      .map((command) => {
        const functionName = `execute${pascalCase(command.id)}`;
        const requestName = pascalCase(command.request.id);
        const responseName = typeName(command.response);
        const defaultRequest = command.request.fields.length === 0 ? " = {}" : "";
        const invocation =
          command.request.fields.length === 0
            ? `service.get(${JSON.stringify(`/api/${command.id}`)})`
            : `service.post(${JSON.stringify(`/api/${command.id}`)}, encode${requestName}(request))`;
        return `${doc(command.description)}
export async function ${functionName}(
  service: FetchService,
  request: ${requestName}${defaultRequest},
): Promise<${responseName}> {
  const response = await ${invocation};
  return ${decodeExpression(command.response, "response")};
}`;
      })
      .join("\n\n");
    return [
      {
        relativePath: "api.ts",
        format: "typescript",
        contents: `// Generated by joi-codegen. Do not edit.\n\n${types}\n\nexport interface CommandRequests {\n${requests}\n}\n\nexport interface CommandResponses {\n${responses}\n}\n`,
      },
      {
        relativePath: "command-client.ts",
        format: "typescript",
        contents: `// Generated by joi-codegen. Do not edit.\n\nimport type { FetchService } from "../../services/fetch-service";\nimport type { ${model.types
          .filter((type) => type.kind !== "alias")
          .map((type) => pascalCase(type.id))
          .join(", ")} } from "./api";\n\n${codecs}\n\n${clientFunctions}\n`,
      },
    ];
  },
});
