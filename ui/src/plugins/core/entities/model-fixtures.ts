import type { EntityDescription } from "./entity-description";
import type { ModelTypeDescription } from "../../../generated/api/api";

/** Converts test-only runtime fixtures into mock model-info responses. Never used by application code. */
export function modelFixture(entity: EntityDescription): ModelTypeDescription {
  return {
    name: entity.tableName,
    history: false,
    attributes: entity.attributes.map((attribute) => ({
      name: attribute.id,
      description: attribute.description ?? "",
      dataType: attribute.valueType,
      optional: attribute.optional ?? false,
      key: attribute.id === entity.identityAttribute,
      references: attribute.lookup ? { model: attribute.lookup, attribute: "id" } : null,
    })),
    presentation: {
      label: entity.label,
      pluralLabel: entity.pluralLabel,
      icon: "unknown",
      labelTemplate: entity.labelTemplate ?? "${id}",
      fields: entity.attributes.map((attribute) => ({
        attribute: attribute.id,
        label: attribute.label,
        control:
          attribute.edit?.control ?? attribute.create?.control ?? (attribute.valueType === "int" ? "integer" : "text"),
        editable: !!attribute.edit,
        creatable: !!attribute.create,
        hidden: attribute.create?.hidden ?? false,
        defaultKind:
          typeof attribute.create?.initialValue === "function"
            ? "ksuid"
            : attribute.create?.initialValue !== undefined
              ? "literal"
              : null,
        defaultValue:
          typeof attribute.create?.initialValue === "function"
            ? null
            : attribute.create?.initialValue !== undefined
              ? String(attribute.create.initialValue)
              : null,
        placeholder: attribute.edit?.placeholder ?? null,
        table: !!attribute.table,
        visible: attribute.table?.visibleByDefault ?? false,
        width: attribute.table?.width ?? null,
        format: attribute.table?.type === "time" ? "date" : (attribute.table?.type ?? null),
        facet: attribute.facet ?? false,
        validation: [],
      })),
    },
  };
}

/** Serializes a mock response using the same snake_case wire names as Rust. */
export function modelWireFixture(entity: EntityDescription) {
  const model = modelFixture(entity);
  const { pluralLabel, labelTemplate, fields, ...presentation } = model.presentation!;
  return {
    ...model,
    attributes: model.attributes.map(({ dataType, ...attribute }) => ({ ...attribute, data_type: dataType })),
    presentation: {
      ...presentation,
      plural_label: pluralLabel,
      label_template: labelTemplate,
      fields: fields.map(({ defaultKind, defaultValue, ...field }) => ({
        ...field,
        default_kind: defaultKind,
        default_value: defaultValue,
      })),
    },
  };
}
