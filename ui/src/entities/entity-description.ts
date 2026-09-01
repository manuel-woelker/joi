import type { IconComponent } from "../icons/icon-component";
import type { LookupId } from "../lookups/lookup";
import type { QueryValue, QueryValueType } from "../query/query-result";
import type { ValidationFunction } from "../validation/validation";

/** Input control used to edit an entity attribute. */
export type EntityEditControl = "text" | "textarea" | "integer" | "lookup";

/** Default table presentation for an entity attribute. */
export interface EntityTableDescription {
  readonly visibleByDefault?: boolean;
  readonly width?: number;
}

/** Form presentation for an entity attribute. */
export interface EntityEditDescription<TValue extends QueryValue> {
  readonly control: TValue extends string ? "text" | "textarea" | "lookup" : "integer";
  readonly required?: boolean;
  readonly rows?: number;
  readonly placeholder?: string;
  readonly readonly?: boolean;
  readonly disabled?: boolean;
}

/** Form presentation and initial value used when creating an entity attribute. */
export interface EntityCreateDescription<TValue extends QueryValue> {
  readonly control?: TValue extends string ? "text" | "textarea" | "lookup" : "integer";
  readonly required?: boolean;
  readonly rows?: number;
  readonly placeholder?: string;
  readonly hidden?: boolean;
  readonly initialValue?: TValue | (() => TValue);
}

/** Description shared by every entity attribute value type. */
export interface EntityAttributeDescription<
  TId extends string,
  TValue extends QueryValue,
  TValueType extends QueryValueType,
> {
  readonly id: TId;
  readonly label: string;
  readonly valueType: TValueType;
  readonly table?: EntityTableDescription;
  readonly edit?: EntityEditDescription<TValue>;
  readonly create?: EntityCreateDescription<TValue>;
  readonly validation?: ValidationFunction<TValue>;
  readonly lookup?: LookupId;
  readonly optional?: boolean;
}

/** String-valued entity attribute. */
export type StringEntityAttribute<TId extends string = string> = EntityAttributeDescription<TId, string, "string">;

/** Integer-valued entity attribute. */
export type IntegerEntityAttribute<TId extends string = string> = EntityAttributeDescription<TId, number, "int">;

/** Entity attribute accepted by generic binding infrastructure. */
export type AnyEntityAttribute = StringEntityAttribute | IntegerEntityAttribute;

/** Extracts the domain value type from an entity attribute description. */
export type EntityAttributeValue<TAttribute extends AnyEntityAttribute> = TAttribute["valueType"] extends "string"
  ? string
  : number;

/** Typed value record inferred from an entity's attribute tuple. */
export type EntityValues<TAttributes extends readonly AnyEntityAttribute[]> = {
  readonly [TAttribute in TAttributes[number] as TAttribute["id"]]: EntityAttributeValue<TAttribute>;
};

/** Canonical UI description of one entity kind. */
export interface EntityDescription<TAttributes extends readonly AnyEntityAttribute[] = readonly AnyEntityAttribute[]> {
  readonly id: string;
  readonly tableName: string;
  readonly label: string;
  readonly pluralLabel: string;
  readonly icon: IconComponent;
  readonly identityAttribute: TAttributes[number]["id"];
  readonly attributes: TAttributes;
  readonly validation?: ValidationFunction<EntityValues<TAttributes>>;
}

/** Defines and validates an entity while preserving literal attribute IDs and value types. */
export function defineEntity<const TAttributes extends readonly AnyEntityAttribute[]>(
  description: EntityDescription<TAttributes>,
): EntityDescription<TAttributes> {
  validateEntityDescription(description);
  return description;
}

/** Returns an attribute or throws an entity-aware error when it is not described. */
export function requireEntityAttribute(description: EntityDescription, attributeId: string): AnyEntityAttribute {
  const attribute = description.attributes.find((candidate) => candidate.id === attributeId);
  if (!attribute) throw new Error(`Entity '${description.id}' does not define attribute '${attributeId}'`);
  return attribute;
}

/** Validates structural invariants of an entity description. */
export function validateEntityDescription(description: EntityDescription): void {
  if (!description.id.trim()) throw new Error("Entity must have a non-empty ID");
  if (!description.tableName.trim()) throw new Error(`Entity '${description.id}' must have a non-empty table name`);
  if (!description.label.trim()) throw new Error(`Entity '${description.id}' must have a non-empty label`);
  if (!description.pluralLabel.trim()) throw new Error(`Entity '${description.id}' must have a non-empty plural label`);
  if (typeof description.icon !== "function") throw new Error(`Entity '${description.id}' must define an icon`);
  if (description.attributes.length === 0) throw new Error(`Entity '${description.id}' must define attributes`);

  const ids = new Set<string>();
  for (const attribute of description.attributes) {
    if (!attribute.id.trim()) throw new Error(`Entity '${description.id}' has an empty attribute ID`);
    if (ids.has(attribute.id)) throw new Error(`Entity '${description.id}' has duplicate attribute '${attribute.id}'`);
    ids.add(attribute.id);
    if (!attribute.label.trim()) {
      throw new Error(`Entity '${description.id}' attribute '${attribute.id}' must have a non-empty label`);
    }
    validateEditControl(description.id, attribute);
    validateCreateControl(description.id, attribute);
  }

  if (!ids.has(description.identityAttribute)) {
    throw new Error(`Entity '${description.id}' identity attribute '${description.identityAttribute}' is not defined`);
  }
  const identity = requireEntityAttribute(description, description.identityAttribute);
  if (identity.valueType !== "string")
    throw new Error(`Entity '${description.id}' identity attribute must be a string`);
  const creatable = description.attributes.filter((attribute) => attribute.create);
  if (creatable.length > 0 && creatable.length !== description.attributes.length) {
    const missing = description.attributes.find((attribute) => !attribute.create)!;
    throw new Error(`Entity '${description.id}' create definition is missing attribute '${missing.id}'`);
  }
}

function validateCreateControl(entityId: string, attribute: AnyEntityAttribute): void {
  if (!attribute.create) return;
  const control = attribute.create.control ?? attribute.edit?.control;
  if (attribute.create.hidden) {
    if (control)
      throw new Error(`Entity '${entityId}' attribute '${attribute.id}' is hidden but defines a create control`);
    if (attribute.create.initialValue === undefined) {
      throw new Error(`Entity '${entityId}' hidden create attribute '${attribute.id}' requires an initial value`);
    }
    return;
  }
  if (!control) throw new Error(`Entity '${entityId}' create attribute '${attribute.id}' requires a control`);
  const expected: QueryValueType = control === "integer" ? "int" : "string";
  if (control === "lookup" && !attribute.lookup)
    throw new Error(`Entity '${entityId}' attribute '${attribute.id}' uses a lookup control without a lookup`);
  if (attribute.valueType !== expected) {
    throw new Error(
      `Entity '${entityId}' attribute '${attribute.id}' uses ${control} for ${attribute.valueType} values`,
    );
  }
  if (attribute.create.rows !== undefined && control !== "textarea") {
    throw new Error(`Entity '${entityId}' attribute '${attribute.id}' defines create rows for a non-textarea control`);
  }
}

function validateEditControl(entityId: string, attribute: AnyEntityAttribute): void {
  if (!attribute.edit) return;
  const expected: QueryValueType = attribute.edit.control === "integer" ? "int" : "string";
  if (attribute.edit.control === "lookup" && !attribute.lookup)
    throw new Error(`Entity '${entityId}' attribute '${attribute.id}' uses a lookup control without a lookup`);
  if (attribute.valueType !== expected) {
    throw new Error(
      `Entity '${entityId}' attribute '${attribute.id}' uses ${attribute.edit.control} for ${attribute.valueType} values`,
    );
  }
  if (attribute.edit.rows !== undefined && attribute.edit.control !== "textarea") {
    throw new Error(`Entity '${entityId}' attribute '${attribute.id}' defines rows for a non-textarea control`);
  }
}
