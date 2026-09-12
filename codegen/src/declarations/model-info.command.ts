import {
  booleanType,
  defineCommand,
  defineEnum,
  defineStruct,
  list,
  optional,
  stringType,
} from "../engine/model/declarations.ts";

export const ModelAttributeType = defineEnum({
  name: "ModelAttributeType",
  description: "A data type supported by a model attribute.",
  values: [
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
    { name: "attributes", type: list(ModelAttributeDescription), description: "Attributes in declaration order." },
  ],
});

export const ModelInfoResponse = defineStruct({
  name: "ModelInfoResponse",
  description: "The discoverable application model.",
  fields: [{ name: "models", type: list(ModelTypeDescription), description: "Models ordered by name." }],
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
