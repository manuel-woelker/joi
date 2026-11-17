import {
  booleanType,
  defineCommand,
  defineEnum,
  defineStruct,
  integerType,
  list,
  optional,
  stringType,
} from "../engine/model/declarations.ts";

export const ModelValidationRule = defineStruct({
  name: "ModelValidationRule",
  description: "Declarative validation shared by server and client. Regex patterns use the common Unicode subset.",
  fields: [
    {
      name: "kind",
      type: defineEnum({
        name: "ModelValidationKind",
        description: "Validation operations.",
        values: [
          { name: "required", description: "Non-empty value." },
          { name: "regex", description: "Matches a Unicode pattern." },
        ],
      }),
      description: "The validation operation.",
    },
    { name: "pattern", type: optional(stringType), description: "Unicode regex for regex rules." },
    { name: "message", type: stringType, description: "Validation failure message." },
  ],
});

export const ModelFieldPresentation = defineStruct({
  name: "ModelFieldPresentation",
  description: "Server-owned form and table settings for an attribute.",
  fields: [
    { name: "attribute", type: stringType, description: "Attribute name in the storage schema." },
    { name: "label", type: stringType, description: "Human-readable attribute label." },
    {
      name: "control",
      type: defineEnum({
        name: "ModelControl",
        description: "Input controls.",
        values: ["text", "html", "textarea", "integer", "lookup"].map((name) => ({
          name,
          description: `${name} input.`,
        })),
      }),
      description: "Generic input control.",
    },
    { name: "editable", type: booleanType, description: "Whether an edit form offers this field." },
    { name: "creatable", type: booleanType, description: "Whether creation supplies this field." },
    { name: "hidden", type: booleanType, description: "Whether the creation field is hidden." },
    {
      name: "defaultKind",
      type: optional(
        defineEnum({
          name: "ModelDefaultKind",
          description: "Creation defaults.",
          values: [
            { name: "literal", description: "Literal value." },
            { name: "ksuid", description: "New KSUID." },
          ],
        }),
      ),
      description: "Client creation default strategy.",
    },
    { name: "defaultValue", type: optional(stringType), description: "Literal default (parsed for numeric fields)." },
    { name: "placeholder", type: optional(stringType), description: "Input placeholder." },
    { name: "table", type: booleanType, description: "Whether the attribute is available as a table column." },
    { name: "visible", type: booleanType, description: "Default column visibility." },
    { name: "width", type: optional(integerType), description: "Default column width." },
    {
      name: "format",
      type: optional(
        defineEnum({
          name: "ModelFormat",
          description: "Table formatting.",
          values: ["text", "number", "date"].map((name) => ({ name, description: `${name} format.` })),
        }),
      ),
      description: "Column display format.",
    },
    { name: "facet", type: booleanType, description: "Whether grouped counts are offered." },
    { name: "validation", type: list(ModelValidationRule), description: "Rules enforced on the server and in forms." },
  ],
});

export const ModelPresentation = defineStruct({
  name: "ModelPresentation",
  description: "Canonical presentation and validation metadata for an entity.",
  fields: [
    {
      name: "route",
      type: optional(
        defineStruct({
          name: "ModelEntityRoute",
          description: "Public entity-page links.",
          fields: [
            { name: "type", type: stringType, description: "URL type prefix, such as ticket." },
            {
              name: "attribute",
              type: stringType,
              description: "String attribute used to resolve a public entity identifier.",
            },
          ],
        }),
      ),
      description: "Optional public link type and lookup attribute; otherwise use the entity type and primary key.",
    },
    { name: "label", type: stringType, description: "Singular entity label." },
    { name: "pluralLabel", type: stringType, description: "Plural entity label." },
    { name: "labelTemplate", type: stringType, description: "Plain-text label with attribute substitutions." },
    { name: "icon", type: stringType, description: "Symbolic icon name, resolved by the client icon registry." },
    {
      name: "fields",
      type: list(ModelFieldPresentation),
      description: "Fields in UI declaration order; schema types remain authoritative.",
    },
  ],
});

export const ModelAttributeType = defineEnum({
  name: "ModelAttributeType",
  description: "A data type supported by a model attribute.",
  values: [
    { name: "reference_list", description: "An ordered list of references to one entity type." },
    { name: "string", description: "A UTF-8 string value." },
    { name: "int", description: "A signed integer value." },
  ],
});

export const ModelAttributeReference = defineStruct({
  name: "ModelAttributeReference",
  description: "The model attribute targeted by a reference.",
  fields: [
    { name: "model", type: stringType, description: "The referenced model name." },
    { name: "attribute", type: stringType, description: "The referenced attribute name." },
  ],
});

export const ModelAttributeDescription = defineStruct({
  name: "ModelAttributeDescription",
  description: "Metadata for one model attribute.",
  fields: [
    { name: "name", type: stringType, description: "The attribute name." },
    { name: "description", type: stringType, description: "A human-readable attribute description." },
    { name: "dataType", type: ModelAttributeType, description: "The attribute value type." },
    { name: "optional", type: booleanType, description: "Whether the attribute accepts null." },
    { name: "key", type: booleanType, description: "Whether the attribute is the model key." },
    {
      name: "references",
      type: optional(ModelAttributeReference),
      description: "The referenced model attribute, or null for a scalar attribute.",
    },
  ],
});

export const ModelTypeDescription = defineStruct({
  name: "ModelTypeDescription",
  description: "A discoverable server-side model and its attributes.",
  fields: [
    { name: "name", type: stringType, description: "The model name." },
    { name: "domain", type: optional(stringType), description: "Owning domain, or null for shared storage tables." },
    { name: "attributes", type: list(ModelAttributeDescription), description: "Attributes in declaration order." },
    { name: "history", type: booleanType, description: "Whether this model has retained entity history." },
    {
      name: "presentation",
      type: optional(ModelPresentation),
      description: "Canonical UI metadata; absent for read-only generic models.",
    },
  ],
});

export const DomainAttributeDescription = defineStruct({
  name: "DomainAttributeDescription",
  description: "An attribute from a compiled domain definition.",
  fields: [
    { name: "name", type: stringType, description: "The attribute name." },
    { name: "description", type: stringType, description: "The attribute description." },
    { name: "dataType", type: stringType, description: "A readable type expression, including nested references." },
  ],
});

export const DomainModelDescription = defineStruct({
  name: "DomainModelDescription",
  description: "A model defined in a domain package, independent of storage tables.",
  fields: [
    { name: "id", type: stringType, description: "Domain-qualified model identity." },
    { name: "domain", type: stringType, description: "Owning domain namespace." },
    { name: "name", type: stringType, description: "The entity name within the domain." },
    { name: "description", type: stringType, description: "The entity description." },
    { name: "attributes", type: list(DomainAttributeDescription), description: "Attributes in declaration order." },
  ],
});

export const DomainEnumValueDescription = defineStruct({
  name: "DomainEnumValueDescription",
  description: "One allowed value in a domain enumeration.",
  fields: [
    { name: "name", type: stringType, description: "Stable enum value." },
    { name: "description", type: stringType, description: "Human-readable value description." },
  ],
});

export const DomainEnumDescription = defineStruct({
  name: "DomainEnumDescription",
  description: "A named enumeration defined by a domain package.",
  fields: [
    { name: "id", type: stringType, description: "Domain-qualified enum identity." },
    { name: "domain", type: stringType, description: "Owning domain namespace." },
    { name: "name", type: stringType, description: "Enum name within the domain." },
    { name: "description", type: stringType, description: "Human-readable enum description." },
    { name: "values", type: list(DomainEnumValueDescription), description: "Allowed values in declaration order." },
  ],
});

export const ModelInfoResponse = defineStruct({
  name: "ModelInfoResponse",
  description: "The discoverable application model.",
  fields: [
    { name: "models", type: list(ModelTypeDescription), description: "Storage models ordered by name." },
    {
      name: "domainModels",
      type: list(DomainModelDescription),
      description: "Compiled domain models ordered by identity.",
    },
    {
      name: "domainEnums",
      type: list(DomainEnumDescription),
      description: "Compiled domain enums ordered by identity.",
    },
  ],
});

export default defineCommand({
  id: "model-info",
  description: "Return discoverable application models and their attributes.",
  request: defineStruct({
    name: "ModelInfoRequest",
    description: "An empty model information request.",
    fields: [],
  }),
  response: ModelInfoResponse,
});
