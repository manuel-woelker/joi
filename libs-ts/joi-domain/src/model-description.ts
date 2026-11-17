import type { EntityType, EnumType, TypeDefinition } from "./entity-definition.ts";

export type DescribedType =
  | { readonly kind: "string" | "date" | "date-range" }
  | { readonly kind: "set"; readonly element: DescribedType }
  | { readonly kind: "ref"; readonly entity: string }
  | { readonly kind: "enum"; readonly enumeration: string };

export interface ModelDescription {
  readonly version: 1;
  readonly enums: readonly {
    readonly name: string;
    readonly description?: string;
    readonly values: readonly { readonly name: string; readonly description?: string }[];
  }[];
  readonly entities: readonly {
    readonly name: string;
    readonly description?: string;
    readonly attributes: readonly {
      readonly name: string;
      readonly description?: string;
      readonly type: DescribedType;
    }[];
  }[];
}

/** Converts runtime definitions into a JSON-safe model with named references. */
export function describeModel(
  entities: readonly EntityType[],
  enumerations: readonly EnumType[] = [],
): ModelDescription {
  const names = new Set<string>();
  const definitions = new Set(entities);
  for (const entity of entities) {
    if (!entity.name.trim() || names.has(entity.name))
      throw new Error(`Duplicate or empty entity name: ${entity.name}`);
    names.add(entity.name);
  }
  const enums = new Set(enumerations);
  for (const enumeration of enumerations) {
    if (!enumeration.name.trim() || names.has(enumeration.name)) {
      throw new Error(`Duplicate or empty model type name: ${enumeration.name}`);
    }
    names.add(enumeration.name);
    const values = new Set<string>();
    if (enumeration.values.length === 0) throw new Error(`Enum '${enumeration.name}' has no values`);
    for (const value of enumeration.values) {
      if (!value.name.trim() || values.has(value.name)) {
        throw new Error(`Duplicate or empty value in enum '${enumeration.name}': ${value.name}`);
      }
      values.add(value.name);
    }
  }

  const describeType = (type: TypeDefinition): DescribedType => {
    switch (type.kind) {
      case "string":
      case "date":
      case "date-range":
        return { kind: type.kind };
      case "set":
        return { kind: "set", element: describeType(type.element) };
      case "ref":
        if (!definitions.has(type.entity)) {
          throw new Error(`Reference to entity '${type.entity.name}' is not exported by the model`);
        }
        return { kind: "ref", entity: type.entity.name };
      case "enum":
        if (!enums.has(type.enumeration)) {
          throw new Error(`Enumeration '${type.enumeration.name}' is not exported by the model`);
        }
        return { kind: "enum", enumeration: type.enumeration.name };
    }
  };

  return {
    version: 1,
    enums: [...enumerations]
      .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0))
      .map((enumeration) => ({
        name: enumeration.name,
        ...(enumeration.description === undefined ? {} : { description: enumeration.description }),
        values: enumeration.values.map((value) => ({
          name: value.name,
          ...(value.description === undefined ? {} : { description: value.description }),
        })),
      })),
    entities: [...entities]
      .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0))
      .map((entity) => {
        const attributes = new Set<string>();
        return {
          name: entity.name,
          ...(entity.description === undefined ? {} : { description: entity.description }),
          attributes: entity.attributes.map((attribute) => {
            if (!attribute.name.trim() || attributes.has(attribute.name)) {
              throw new Error(`Duplicate or empty attribute name in '${entity.name}': ${attribute.name}`);
            }
            attributes.add(attribute.name);
            return {
              name: attribute.name,
              ...(attribute.description === undefined ? {} : { description: attribute.description }),
              type: describeType(attribute.type),
            };
          }),
        };
      }),
  };
}
