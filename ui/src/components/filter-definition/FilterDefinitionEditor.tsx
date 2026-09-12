import { createMemo, For, Show } from "solid-js";

import { Select } from "../Select";
import { Tree } from "../tree/Tree";
import { createTreeRendererRegistry } from "../tree/tree-definition";
import {
  defineTreeFolder,
  defineTreeModel,
  defineTreeNode,
  folderTreeNodeKind,
  treeNodeKind,
  type TreeNode,
} from "../tree/tree-model";
import type { TreeMoveTarget } from "../tree/tree-definition";
import {
  createCompositeFilter,
  createFilterCriterion,
  filterNodeId,
  type CompositeFilterDefinition,
  type FilterCriterionDefinition,
  type FilterDefinition,
  type FilterNodeId,
  type FilterOperand,
  type FilterValue,
} from "./filter-model";
import {
  copyFilter,
  findFilter,
  insertFilter,
  moveFilter,
  removeFilter,
  updateFilter,
  validateFilterDefinition,
} from "./filter-operations";
import {
  defaultFilterOperators,
  operatorsForAttribute,
  validateFilterSchema,
  validateFilterAgainstSchema,
  type FilterableAttribute,
  type FilterOperatorDefinition,
} from "./filter-operators";
import styles from "./FilterDefinitionEditor.module.css";

const criterionKind = treeNodeKind("filter-criterion");

export interface FilterDefinitionEditorProps {
  readonly attributes: readonly FilterableAttribute[];
  readonly value: FilterDefinition;
  readonly onChange: (value: FilterDefinition) => void;
  readonly operators?: readonly FilterOperatorDefinition[];
  readonly ariaLabel?: string;
}

/** Controlled editor for nested composite and attribute filter definitions. */
export function FilterDefinitionEditor(props: FilterDefinitionEditorProps) {
  const operators = () => props.operators ?? defaultFilterOperators;
  const model = createMemo(() => {
    const nodes: TreeNode[] = [];
    const visit = (filter: FilterDefinition) => {
      if (filter.type === "composite") {
        nodes.push(
          defineTreeFolder({ id: filter.id, children: filter.children.map((child) => child.id), data: { filter } }),
        );
        filter.children.forEach(visit);
      } else nodes.push(defineTreeNode({ id: filter.id, kind: criterionKind, data: { filter } }));
    };
    visit(props.value);
    return defineTreeModel({ roots: [props.value.id], nodes });
  });
  const replace = (id: FilterNodeId, next: FilterDefinition) =>
    props.onChange(updateFilter(props.value, id, () => next));
  const firstCriterion = () => {
    const attribute = props.attributes[0];
    if (!attribute) return undefined;
    const operator = operatorsForAttribute(attribute, operators())[0];
    return operator && createFilterCriterion(attribute.id, operator.id, emptyOperand(operator, attribute));
  };
  const addCriterion = (parent: CompositeFilterDefinition) => {
    const criterion = firstCriterion();
    if (!criterion) return;
    props.onChange(insertFilter(props.value, parent.id, parent.children.length, criterion));
  };
  const addGroup = (parent: CompositeFilterDefinition) => {
    const criterion = firstCriterion();
    const group = createCompositeFilter("all", criterion ? [criterion] : []);
    props.onChange(insertFilter(props.value, parent.id, parent.children.length, group));
  };
  const renderers = createMemo(() =>
    createTreeRendererRegistry((node) => String(node.id))
      .replace(folderTreeNodeKind, (node) => {
        const filter = node.data.filter as CompositeFilterDefinition;
        return (
          <div class={`${styles.group} ${styles[filter.kind]}`} classList={{ [styles.disabled]: !!filter.disabled }}>
            <input
              type="checkbox"
              aria-label={`Enable ${filter.kind} group`}
              checked={!filter.disabled}
              onChange={() => replace(filter.id, { ...filter, disabled: !filter.disabled || undefined })}
            />
            <select
              aria-label="Composite filter kind"
              value={filter.kind}
              onChange={(event) =>
                replace(filter.id, { ...filter, kind: event.currentTarget.value as CompositeFilterDefinition["kind"] })
              }
            >
              <option value="all">All of the following must be true</option>
              <option value="one">One of the following must be true</option>
              <option value="none">None of the following must be true</option>
            </select>
            <button type="button" onClick={() => addCriterion(filter)}>
              + Criterion
            </button>
            <button type="button" onClick={() => addGroup(filter)}>
              + Group
            </button>
            <Show when={filter.id !== props.value.id}>
              <button
                type="button"
                aria-label="Delete filter"
                onClick={() => props.onChange(removeFilter(props.value, filter.id))}
              >
                ×
              </button>
            </Show>
          </div>
        );
      })
      .register(criterionKind, (node) => (
        <CriterionRow
          filter={node.data.filter as FilterCriterionDefinition}
          attributes={props.attributes}
          operators={operators()}
          onChange={(filter) => replace(filter.id, filter)}
          onDelete={
            String(node.id) === props.value.id
              ? undefined
              : () => props.onChange(removeFilter(props.value, filterNodeId(String(node.id))))
          }
        />
      ))
      .build(),
  );
  const errors = createMemo(() => {
    try {
      validateFilterSchema(props.attributes, operators());
      return [
        ...validateFilterDefinition(props.value),
        ...validateFilterAgainstSchema(props.value, props.attributes, operators()),
      ];
    } catch (error) {
      return [error instanceof Error ? error.message : "The filter schema is invalid."];
    }
  });

  return (
    <div class={styles.editor}>
      <Show when={!props.attributes.length}>
        <p class={styles.empty}>No filterable attributes are available.</p>
      </Show>
      <Show when={props.attributes.length}>
        <Tree
          ariaLabel={props.ariaLabel ?? "Filter definition"}
          model={model()}
          definition={{
            renderers: renderers(),
            isCollapsible: () => false,
            reserveDisclosureSpace: false,
            classForNode: (node) => {
              const filter = node.data.filter as FilterDefinition;
              return filter.type === "composite"
                ? `${styles.compositeSection} ${styles[filter.kind]}${filter.disabled ? ` ${styles.disabled}` : ""}`
                : undefined;
            },
            move: {
              canMove: (node) => String(node.id) !== props.value.id,
              canMoveTo: (node, target) => canMoveTo(props.value, filterNodeId(String(node.id)), target),
              move: (node, target) =>
                props.onChange(moveFilter(props.value, filterNodeId(String(node.id)), moveTarget(target))),
              copy: (node, target) =>
                props.onChange(copyFilter(props.value, filterNodeId(String(node.id)), moveTarget(target))),
            },
          }}
          class={styles.filterTree}
        />
      </Show>
      <For each={errors()}>{(error) => <p class={styles.error}>{error}</p>}</For>
    </div>
  );
}

function CriterionRow(props: {
  filter: FilterCriterionDefinition;
  attributes: readonly FilterableAttribute[];
  operators: readonly FilterOperatorDefinition[];
  onChange: (filter: FilterCriterionDefinition) => void;
  onDelete?: () => void;
}) {
  const attribute = () => props.attributes.find((item) => item.id === props.filter.attribute) ?? props.attributes[0];
  const availableOperators = () => (attribute() ? operatorsForAttribute(attribute()!, props.operators) : []);
  const operator = () =>
    availableOperators().find((item) => item.id === props.filter.operator) ?? availableOperators()[0];
  const setOperand = (operand?: FilterOperand) => props.onChange({ ...props.filter, operand });
  const parse = (value: string): FilterValue => (attribute()?.valueType === "int" ? Number(value) : value);
  return (
    <div class={styles.criterion} classList={{ [styles.disabled]: !!props.filter.disabled }}>
      <input
        type="checkbox"
        aria-label="Enable criterion"
        checked={!props.filter.disabled}
        onChange={() => props.onChange({ ...props.filter, disabled: !props.filter.disabled || undefined })}
      />
      <select
        aria-label="Filter attribute"
        value={props.filter.attribute}
        onChange={(event) => {
          const nextAttribute = props.attributes.find((item) => item.id === event.currentTarget.value)!;
          const nextOperator =
            operatorsForAttribute(nextAttribute, props.operators).find((item) => item.id === props.filter.operator) ??
            operatorsForAttribute(nextAttribute, props.operators)[0];
          props.onChange({
            ...props.filter,
            attribute: nextAttribute.id,
            operator: nextOperator.id,
            operand: emptyOperand(nextOperator, nextAttribute),
          });
        }}
      >
        <For each={props.attributes}>{(item) => <option value={item.id}>{item.label}</option>}</For>
      </select>
      <select
        aria-label="Comparison operator"
        value={operator()?.id}
        onChange={(event) => {
          const next = availableOperators().find((item) => item.id === event.currentTarget.value)!;
          props.onChange({ ...props.filter, operator: next.id, operand: emptyOperand(next, attribute()!) });
        }}
      >
        <For each={availableOperators()}>{(item) => <option value={item.id}>{item.label}</option>}</For>
      </select>
      <Show keyed when={operator()}>
        {(currentOperator) => (
          <OperandEditor
            attribute={attribute()}
            operator={currentOperator}
            operand={props.filter.operand}
            onChange={setOperand}
            parse={parse}
          />
        )}
      </Show>
      <Show when={props.onDelete}>
        <button type="button" aria-label="Delete filter" onClick={props.onDelete}>
          ×
        </button>
      </Show>
    </div>
  );
}

function OperandEditor(props: {
  attribute?: FilterableAttribute;
  operator?: FilterOperatorDefinition;
  operand?: FilterOperand;
  onChange: (operand?: FilterOperand) => void;
  parse: (value: string) => FilterValue;
}) {
  if (!props.attribute || !props.operator || props.operator.operand === "none") return null;
  if (props.operator.operand === "range")
    return (
      <div class={styles.range}>
        <input
          aria-label="Minimum"
          type={props.attribute.valueType === "int" ? "number" : "text"}
          value={props.operand?.type === "range" ? (props.operand.minimum ?? "") : ""}
          onInput={(event) =>
            props.onChange({
              type: "range",
              minimum: event.currentTarget.value === "" ? undefined : props.parse(event.currentTarget.value),
              maximum: props.operand?.type === "range" ? props.operand.maximum : undefined,
            })
          }
        />
        <span>to</span>
        <input
          aria-label="Maximum"
          type={props.attribute.valueType === "int" ? "number" : "text"}
          value={props.operand?.type === "range" ? (props.operand.maximum ?? "") : ""}
          onInput={(event) =>
            props.onChange({
              type: "range",
              minimum: props.operand?.type === "range" ? props.operand.minimum : undefined,
              maximum: event.currentTarget.value === "" ? undefined : props.parse(event.currentTarget.value),
            })
          }
        />
      </div>
    );
  if (props.operator.operand === "set" && props.attribute.values) {
    const selected = () => new Set(props.operand?.type === "set" ? props.operand.values.map(String) : []);
    return (
      <div class={styles.choices} role="group" aria-label={`${props.attribute.label} values`}>
        <For each={props.attribute.values}>
          {(choice) => (
            <label>
              <input
                type="checkbox"
                checked={selected().has(String(choice.value))}
                onChange={() => {
                  const values = selected();
                  const key = String(choice.value);
                  values.has(key) ? values.delete(key) : values.add(key);
                  props.onChange({
                    type: "set",
                    values: props
                      .attribute!.values!.filter((item) => values.has(String(item.value)))
                      .map((item) => item.value),
                  });
                }}
              />
              {choice.label}
            </label>
          )}
        </For>
      </div>
    );
  }
  if (props.attribute.loadValues || props.attribute.values) {
    const loadEntries =
      props.attribute.loadValues ??
      (async () => ({ entries: props.attribute!.values ?? [], total: props.attribute!.values?.length ?? 0 }));
    const current = props.operand?.type === "value" ? String(props.operand.value) : "";
    return (
      <Select
        ariaLabel={`${props.attribute.label} value`}
        value={current}
        onChange={(value) => props.onChange({ type: "value", value: props.parse(value) })}
        loadEntries={loadEntries}
        entryId={(entry) => String(entry.value)}
        entryText={(entry) => entry.label}
        placeholder="Choose value"
      />
    );
  }
  const value =
    props.operand?.type === "value"
      ? props.operand.value
      : props.operand?.type === "set"
        ? props.operand.values.join(", ")
        : "";
  return (
    <input
      aria-label="Filter value"
      type={props.attribute.valueType === "int" && props.operator.operand !== "set" ? "number" : "text"}
      value={value}
      placeholder={props.operator.operand === "set" ? "Comma-separated values" : "Value"}
      onInput={(event) =>
        props.onChange(
          props.operator!.operand === "set"
            ? {
                type: "set",
                values: event.currentTarget.value
                  .split(",")
                  .map((item) => item.trim())
                  .filter(Boolean)
                  .map(props.parse),
              }
            : { type: "value", value: props.parse(event.currentTarget.value) },
        )
      }
    />
  );
}

function emptyOperand(operator: FilterOperatorDefinition, attribute: FilterableAttribute): FilterOperand | undefined {
  if (operator.operand === "none") return undefined;
  if (operator.operand === "range") return { type: "range" };
  if (operator.operand === "set") return { type: "set", values: [] };
  return { type: "value", value: attribute.valueType === "int" ? 0 : "" };
}

function moveTarget(target: TreeMoveTarget) {
  if (!target.parentId) throw new Error("Filters must be moved inside a composite");
  return { parentId: filterNodeId(String(target.parentId)), index: target.index };
}

function canMoveTo(root: FilterDefinition, id: FilterNodeId, target: TreeMoveTarget): boolean {
  if (!target.parentId) return false;
  const parentId = filterNodeId(String(target.parentId));
  const parent = findFilter(root, parentId);
  const node = findFilter(root, id);
  return parent?.type === "composite" && !!node && !findFilter(node, parentId);
}
