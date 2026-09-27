import { createComponent } from "solid-js";
import { serviceKey } from "../../../base/service-registry";
import type { FetchService } from "../../../base/services/fetch-service";
import { CommandService } from "../../../generated/api/command-service";
import type { ModelInfoResponse, ModelTypeDescription, ModelFieldPresentation } from "../../../generated/api/api";
import type { IconComponent } from "../../../icons/icon-component";
import { richTextPlainText } from "../../../components/rich-text/html";
import {
  defineEntity,
  entityId,
  type EntityDescription,
  type EntityId,
  type AnyEntityAttribute,
} from "./entity-description";
import { EntityRegistry } from "./entity-registry";
import { generateKsuid } from "./ksuid";
import { lookupId } from "../lookups/lookup";
import { modelIcon } from "./model-icons";
import type { ValidationContext } from "../../../validation/validation";

/** One cached model-info request per service; failed loads can be explicitly retried. */
export class ModelService {
  private pending?: Promise<EntityRegistry>;
  private registry?: EntityRegistry;
  private infoRequest?: Promise<ModelInfoResponse>;
  constructor(private readonly fetchService: FetchService) {}

  load(): Promise<EntityRegistry> {
    this.pending ??= this.info()
      .then((response) => {
        const registry = new EntityRegistry(response.models.map(decodeEntity));
        this.registry = registry;
        return registry;
      })
      .catch((error) => {
        this.pending = undefined;
        this.infoRequest = undefined;
        throw error;
      });
    return this.pending;
  }

  /** Synchronous reads are only valid after the model-loading boundary completes. */
  require(id: EntityId): EntityDescription {
    if (!this.registry) throw new Error("Application model has not loaded");
    return this.registry.require(id);
  }

  info(): Promise<ModelInfoResponse> {
    this.infoRequest ??= new CommandService(this.fetchService).modelInfo({}).catch((error) => {
      this.infoRequest = undefined;
      throw error;
    });
    return this.infoRequest;
  }

  /** Defers icon resolution until render, allowing plugins to register before model loading. */
  icon(id: EntityId): IconComponent {
    return (props) => createComponent(this.require(id).icon, props);
  }
}

export const modelServiceKey = serviceKey<ModelService>("model-service");
const services = new WeakMap<FetchService, ModelService>();

/** Shares the model cache across lookup, history, explorer and startup consumers. */
export function modelServiceFor(fetchService: FetchService): ModelService {
  let service = services.get(fetchService);
  if (!service) {
    service = new ModelService(fetchService);
    services.set(fetchService, service);
  }
  return service;
}

/** Converts wire metadata to runtime controls and compiled label parts, once per model load. */
export function decodeEntity(model: ModelTypeDescription): EntityDescription {
  const presentation = model.presentation;
  const key = model.attributes.filter((attribute) => attribute.key);
  if (key.length !== 1) throw new Error(`Model '${model.name}' must have one identity attribute`);
  const fields = presentation?.fields ?? model.attributes.map((attribute) => ({ attribute: attribute.name }));
  const attributes: AnyEntityAttribute[] = fields.map((entry) => {
    const column = model.attributes.find((attribute) => attribute.name === entry.attribute);
    if (!column) throw new Error(`Unknown model attribute '${model.name}.${entry.attribute}'`);
    const field = presentation ? (entry as ModelFieldPresentation) : undefined;
    const required = field?.validation.some((rule) => rule.kind === "required") ?? false;
    const rules =
      field?.validation.map((rule) => ({
        ...rule,
        regex: rule.kind === "regex" ? new RegExp(rule.pattern!, "u") : undefined,
      })) ?? [];
    const initialValue =
      field?.defaultKind === "ksuid"
        ? generateKsuid
        : field?.defaultValue != null
          ? column.dataType === "int"
            ? Number(field.defaultValue)
            : field.defaultValue
          : undefined;
    const edit = field?.editable
      ? { control: field.control, required, placeholder: field.placeholder ?? undefined }
      : undefined;
    return {
      id: column.name,
      label: field?.label ?? column.name,
      description: column.description,
      valueType: column.dataType,
      optional: column.optional,
      generated: !field?.creatable && !field?.editable,
      lookup: column.references ? lookupId(column.references.model) : undefined,
      facet: field?.facet ?? false,
      table: field?.table
        ? { visibleByDefault: field.visible, width: field.width ?? undefined, type: field.format ?? undefined }
        : undefined,
      edit,
      create: field?.creatable
        ? {
            hidden: field.hidden,
            control: field.hidden ? undefined : field.control,
            initialValue,
            required,
            placeholder: field.placeholder ?? undefined,
          }
        : undefined,
      validation: rules.length
        ? ({ value, addValidationFailure }: ValidationContext<string | number>) => {
            for (const rule of rules) {
              const text = String(value ?? "");
              const valid =
                rule.kind === "required"
                  ? (field?.control === "html" ? richTextPlainText(text) : text).trim().length > 0
                  : !text || rule.regex!.test(text);
              if (!valid) addValidationFailure({ message: rule.message });
            }
          }
        : undefined,
    } as AnyEntityAttribute;
  });
  if (attributes.length !== model.attributes.length)
    throw new Error(`Incomplete model presentation for '${model.name}'`);
  return defineEntity({
    id: entityId(model.name),
    tableName: model.name,
    identityAttribute: key[0].name,
    label: presentation?.label ?? model.name,
    pluralLabel: presentation?.pluralLabel ?? model.name,
    labelTemplate: presentation?.labelTemplate,
    icon: modelIcon(presentation?.icon),
    attributes,
  });
}
