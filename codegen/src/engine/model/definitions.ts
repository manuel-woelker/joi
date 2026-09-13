export type TypeId = string & { readonly typeIdBrand: unique symbol };
export type FieldId = string & { readonly fieldIdBrand: unique symbol };
export type CommandId = string & { readonly commandIdBrand: unique symbol };
export type GeneratorId = string & { readonly generatorIdBrand: unique symbol };

export type BuiltinName = "boolean" | "integer" | "json" | "string";

export interface BuiltinDefinition {
  readonly kind: "builtin";
  readonly name: BuiltinName;
}

export interface FieldDefinition {
  readonly id: FieldId;
  readonly type: TypeDefinition;
  readonly description: string;
}

export interface StructDefinition {
  readonly kind: "struct";
  readonly id: TypeId;
  readonly description: string;
  readonly fields: readonly FieldDefinition[];
}

export interface EnumValueDefinition {
  readonly id: FieldId;
  readonly description: string;
}

export interface EnumDefinition {
  readonly kind: "enum";
  readonly id: TypeId;
  readonly description: string;
  readonly values: readonly EnumValueDefinition[];
}

export interface AliasDefinition {
  readonly kind: "alias";
  readonly id: TypeId;
  readonly description: string;
  readonly type: TypeDefinition;
}

export interface OptionalDefinition {
  readonly kind: "optional";
  readonly value: TypeDefinition;
}

export interface ListDefinition {
  readonly kind: "list";
  readonly value: TypeDefinition;
}

export type NamedTypeDefinition = StructDefinition | EnumDefinition | AliasDefinition;
export type TypeDefinition = NamedTypeDefinition | BuiltinDefinition | OptionalDefinition | ListDefinition;

export interface CommandDefinition {
  readonly id: CommandId;
  readonly description: string;
  readonly request: StructDefinition;
  readonly response: TypeDefinition;
  readonly sourcePath: string;
  readonly requiredHandler: boolean;
}

export interface ApiModel {
  readonly commands: readonly CommandDefinition[];
  readonly types: readonly NamedTypeDefinition[];
}
