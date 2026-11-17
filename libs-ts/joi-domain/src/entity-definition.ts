const entityTypeBrand: unique symbol = Symbol("entity-type");

export type TypeDefinition =
  | { readonly kind: "string" }
  | { readonly kind: "date" }
  | { readonly kind: "date-range" }
  | { readonly kind: "set"; readonly element: TypeDefinition }
  | { readonly kind: "ref"; readonly entity: EntityType };

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
};

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
