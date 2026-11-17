const entityTypeBrand: unique symbol = Symbol("entity-type");
const enumTypeBrand: unique symbol = Symbol("enum-type");

export type TypeDefinition =
  | { readonly kind: "string" }
  | { readonly kind: "date" }
  | { readonly kind: "date-range" }
  | { readonly kind: "set"; readonly element: TypeDefinition }
  | { readonly kind: "ref"; readonly entity: EntityType }
  | { readonly kind: "enum"; readonly enumeration: EnumType };

export interface EnumValueDefinition {
  readonly name: string;
  readonly description?: string;
}

/** A named set of allowed values that can be used as an attribute type. */
export interface EnumType<
  Name extends string = string,
  Values extends readonly EnumValueDefinition[] = readonly EnumValueDefinition[],
> {
  readonly name: Name;
  readonly description?: string;
  readonly values: Values;
  readonly [enumTypeBrand]: true;
}

export interface AttributeDefinition {
  readonly name: string;
  readonly description?: string;
  readonly type: TypeDefinition;
}

/** An entity definition that can be used as a type in other definitions. */
export interface EntityType<
  Name extends string = string,
  Attributes extends readonly AttributeDefinition[] = readonly AttributeDefinition[],
> {
  readonly name: Name;
  readonly description?: string;
  readonly attributes: Attributes;
  readonly [entityTypeBrand]: true;
}

/** Primitive types and constructors for collection and entity-reference attributes. */
export const Types = {
  String: { kind: "string" } as const,
  Date: { kind: "date" } as const,
  DateRange: { kind: "date-range" } as const,
  set: <T extends TypeDefinition>(element: T) => ({ kind: "set" as const, element }),
  ref: <T extends EntityType>(entity: T) => ({ kind: "ref" as const, entity }),
  enumeration: <T extends EnumType>(enumeration: T) => ({ kind: "enum" as const, enumeration }),
};

/** Defines a reusable enumeration and returns its branded type reference. */
export function defineEnum<const Name extends string, const Values extends readonly EnumValueDefinition[]>(definition: {
  readonly name: Name;
  readonly description?: string;
  readonly values: Values;
}): EnumType<Name, Values> {
  return { ...definition, [enumTypeBrand]: true };
}

/** Defines an entity and returns its branded type reference. */
export function defineEntity<
  const Name extends string,
  const Attributes extends readonly AttributeDefinition[],
>(definition: {
  readonly name: Name;
  readonly description?: string;
  readonly attributes: Attributes;
}): EntityType<Name, Attributes> {
  return { ...definition, [entityTypeBrand]: true };
}

/** Identifies entity definitions exported by a domain model module. */
export function isEntityType(value: unknown): value is EntityType {
  return typeof value === "object" && value !== null && entityTypeBrand in value;
}

/** Identifies enumerations exported by a domain model module. */
export function isEnumType(value: unknown): value is EnumType {
  return typeof value === "object" && value !== null && enumTypeBrand in value;
}
