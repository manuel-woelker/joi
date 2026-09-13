const declarationMarker = Symbol.for("joi.codegen.declaration");

interface DeclarationBase {
  readonly [declarationMarker]: true;
}

export type BuiltinName = "boolean" | "integer" | "json" | "string";

export interface BuiltinDeclaration extends DeclarationBase {
  readonly kind: "builtin";
  readonly name: BuiltinName;
}

export interface FieldDeclaration {
  readonly name: string;
  readonly type: TypeDeclaration;
  readonly description: string;
}

export interface StructDeclaration extends DeclarationBase {
  readonly kind: "struct";
  readonly name: string;
  readonly description: string;
  readonly fields: readonly FieldDeclaration[];
}

export interface EnumValueDeclaration {
  readonly name: string;
  readonly description: string;
}

export interface EnumDeclaration extends DeclarationBase {
  readonly kind: "enum";
  readonly name: string;
  readonly description: string;
  readonly values: readonly EnumValueDeclaration[];
}

export interface AliasDeclaration extends DeclarationBase {
  readonly kind: "alias";
  readonly name: string;
  readonly description: string;
  readonly type: TypeDeclaration;
}

export interface OptionalDeclaration extends DeclarationBase {
  readonly kind: "optional";
  readonly value: TypeDeclaration;
}

export interface ListDeclaration extends DeclarationBase {
  readonly kind: "list";
  readonly value: TypeDeclaration;
}

export type NamedTypeDeclaration = StructDeclaration | EnumDeclaration | AliasDeclaration;
export type TypeDeclaration = NamedTypeDeclaration | BuiltinDeclaration | OptionalDeclaration | ListDeclaration;

export interface CommandDeclaration extends DeclarationBase {
  readonly kind: "command";
  readonly id: string;
  readonly description: string;
  readonly request: StructDeclaration;
  readonly response: TypeDeclaration;
  readonly requiredHandler: boolean;
}

function freezeFields(fields: readonly FieldDeclaration[]): readonly FieldDeclaration[] {
  return Object.freeze(fields.map((field) => Object.freeze({ ...field })));
}

export const booleanType: BuiltinDeclaration = Object.freeze({
  [declarationMarker]: true as const,
  kind: "builtin",
  name: "boolean",
});

export const integerType: BuiltinDeclaration = Object.freeze({
  [declarationMarker]: true as const,
  kind: "builtin",
  name: "integer",
});

export const jsonType: BuiltinDeclaration = Object.freeze({
  [declarationMarker]: true as const,
  kind: "builtin",
  name: "json",
});

export const stringType: BuiltinDeclaration = Object.freeze({
  [declarationMarker]: true as const,
  kind: "builtin",
  name: "string",
});

export function defineStruct(input: {
  readonly name: string;
  readonly description: string;
  readonly fields: readonly FieldDeclaration[];
}): StructDeclaration {
  return Object.freeze({
    [declarationMarker]: true as const,
    kind: "struct" as const,
    name: input.name,
    description: input.description,
    fields: freezeFields(input.fields),
  });
}

export function defineEnum(input: {
  readonly name: string;
  readonly description: string;
  readonly values: readonly EnumValueDeclaration[];
}): EnumDeclaration {
  return Object.freeze({
    [declarationMarker]: true as const,
    kind: "enum" as const,
    name: input.name,
    description: input.description,
    values: Object.freeze(input.values.map((value) => Object.freeze({ ...value }))),
  });
}

export function defineAlias(input: {
  readonly name: string;
  readonly description: string;
  readonly type: TypeDeclaration;
}): AliasDeclaration {
  return Object.freeze({ [declarationMarker]: true as const, kind: "alias", ...input });
}

export function optional(value: TypeDeclaration): OptionalDeclaration {
  return Object.freeze({ [declarationMarker]: true as const, kind: "optional", value });
}

export function list(value: TypeDeclaration): ListDeclaration {
  return Object.freeze({ [declarationMarker]: true as const, kind: "list", value });
}

export function defineCommand(input: {
  readonly id: string;
  readonly description: string;
  readonly request: StructDeclaration;
  readonly response: TypeDeclaration;
  readonly requiredHandler?: boolean;
}): CommandDeclaration {
  return Object.freeze({ [declarationMarker]: true as const, kind: "command", requiredHandler: true, ...input });
}

export function isCommandDeclaration(value: unknown): value is CommandDeclaration {
  return (
    typeof value === "object" &&
    value !== null &&
    declarationMarker in value &&
    value[declarationMarker] === true &&
    "kind" in value &&
    value.kind === "command"
  );
}
