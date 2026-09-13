import type { CommandDeclaration, NamedTypeDeclaration, TypeDeclaration } from "./declarations.ts";
import type {
  AliasDefinition,
  ApiModel,
  BuiltinDefinition,
  CommandDefinition,
  CommandId,
  EnumDefinition,
  FieldId,
  ListDefinition,
  NamedTypeDefinition,
  OptionalDefinition,
  StructDefinition,
  TypeDefinition,
  TypeId,
} from "./definitions.ts";
import { ModelValidationError, requireIdentifier, requireText } from "./model-validation.ts";

export interface SourcedCommandDeclaration {
  readonly declaration: CommandDeclaration;
  readonly sourcePath: string;
}

const builtins: Readonly<Record<"boolean" | "integer" | "json" | "string", BuiltinDefinition>> = Object.freeze({
  boolean: Object.freeze({ kind: "builtin", name: "boolean" }),
  integer: Object.freeze({ kind: "builtin", name: "integer" }),
  json: Object.freeze({ kind: "builtin", name: "json" }),
  string: Object.freeze({ kind: "builtin", name: "string" }),
});

export function buildModel(sources: readonly SourcedCommandDeclaration[]): ApiModel {
  const diagnostics: string[] = [];
  const normalized = new Map<TypeDeclaration, TypeDefinition>();
  const visiting = new Set<TypeDeclaration>();
  const names = new Map<string, NamedTypeDeclaration>();
  const namedTypes: NamedTypeDefinition[] = [];
  const commandIds = new Map<string, string>();

  const normalizeType = (declaration: TypeDeclaration, location: string): TypeDefinition => {
    const existing = normalized.get(declaration);
    if (existing) return existing;
    if (visiting.has(declaration)) {
      diagnostics.push(`${location} contains a recursive type; recursive declarations are not supported`);
      return builtins.string;
    }

    if (declaration.kind === "builtin") return builtins[declaration.name];
    visiting.add(declaration);

    let definition: TypeDefinition;
    if (declaration.kind === "optional") {
      const optionalDefinition: OptionalDefinition = {
        kind: "optional",
        value: normalizeType(declaration.value, `${location}.optional`),
      };
      definition = Object.freeze(optionalDefinition);
    } else if (declaration.kind === "list") {
      const listDefinition: ListDefinition = {
        kind: "list",
        value: normalizeType(declaration.value, `${location}.list`),
      };
      definition = Object.freeze(listDefinition);
    } else {
      requireIdentifier(declaration.name, `${location}.name`, diagnostics);
      requireText(declaration.description, `${location}.description`, diagnostics);
      const previous = names.get(declaration.name);
      if (previous && previous !== declaration) {
        diagnostics.push(`${location}.name '${declaration.name}' is declared by two different objects`);
      } else {
        names.set(declaration.name, declaration);
      }

      if (declaration.kind === "struct") {
        const fieldNames = new Set<string>();
        const fields = declaration.fields.map((field, index) => {
          const fieldLocation = `${location}.fields[${index}]`;
          requireIdentifier(field.name, `${fieldLocation}.name`, diagnostics);
          requireText(field.description, `${fieldLocation}.description`, diagnostics);
          if (fieldNames.has(field.name)) diagnostics.push(`${fieldLocation}.name '${field.name}' is duplicated`);
          fieldNames.add(field.name);
          return Object.freeze({
            id: field.name as FieldId,
            description: field.description,
            type: normalizeType(field.type, `${fieldLocation}.type`),
          });
        });
        const structDefinition: StructDefinition = {
          kind: "struct",
          id: declaration.name as TypeId,
          description: declaration.description,
          fields: Object.freeze(fields),
        };
        definition = Object.freeze(structDefinition);
      } else if (declaration.kind === "enum") {
        const valueNames = new Set<string>();
        const values = declaration.values.map((value, index) => {
          const valueLocation = `${location}.values[${index}]`;
          requireIdentifier(value.name, `${valueLocation}.name`, diagnostics);
          requireText(value.description, `${valueLocation}.description`, diagnostics);
          if (valueNames.has(value.name)) diagnostics.push(`${valueLocation}.name '${value.name}' is duplicated`);
          valueNames.add(value.name);
          return Object.freeze({ id: value.name as FieldId, description: value.description });
        });
        const enumDefinition: EnumDefinition = {
          kind: "enum",
          id: declaration.name as TypeId,
          description: declaration.description,
          values: Object.freeze(values),
        };
        definition = Object.freeze(enumDefinition);
      } else {
        const aliasDefinition: AliasDefinition = {
          kind: "alias",
          id: declaration.name as TypeId,
          description: declaration.description,
          type: normalizeType(declaration.type, `${location}.type`),
        };
        definition = Object.freeze(aliasDefinition);
      }
      namedTypes.push(definition);
    }

    visiting.delete(declaration);
    normalized.set(declaration, definition);
    return definition;
  };

  const commands = [...sources]
    .sort((left, right) => left.sourcePath.localeCompare(right.sourcePath))
    .map(({ declaration, sourcePath }): CommandDefinition => {
      requireIdentifier(declaration.id, `${sourcePath}: command.id`, diagnostics);
      requireText(declaration.description, `${sourcePath}: command.description`, diagnostics);
      const previous = commandIds.get(declaration.id);
      if (previous) diagnostics.push(`${sourcePath}: command.id '${declaration.id}' duplicates ${previous}`);
      commandIds.set(declaration.id, sourcePath);
      return Object.freeze({
        id: declaration.id as CommandId,
        description: declaration.description,
        request: normalizeType(declaration.request, `${sourcePath}: request`) as StructDefinition,
        response: normalizeType(declaration.response, `${sourcePath}: response`),
        sourcePath,
        requiredHandler: declaration.requiredHandler,
      });
    });

  if (diagnostics.length > 0) throw new ModelValidationError(Object.freeze(diagnostics));
  namedTypes.sort((left, right) => left.id.localeCompare(right.id));
  commands.sort((left, right) => left.id.localeCompare(right.id));
  return Object.freeze({ commands: Object.freeze(commands), types: Object.freeze(namedTypes) });
}
