import { createMemo, createUniqueId, For, Show } from "solid-js";
import GripVerticalIcon from "lucide-solid/icons/grip-vertical";

import { Select } from "../Select";
import { Tree } from "../tree/Tree";
import { createTreeRendererRegistry } from "../tree/tree-definition";
import {
  defineTreeFolder,
  defineTreeModel,
  defineTreeNode,
  folderTreeNodeKind,
  treeNodeKind,
  type TreeModel,
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
  isInvalidOneCompositeFilter,
  moveFilter,
  removeFilter,
  updateFilter,
  validateFilterDefinition,
} from "./filter-operations";
import {
  containsFilterOperator,
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
  const model = createMemo(
    () => {
      const nodes: TreeNode[] = [];
      const visit = (filter: FilterDefinition) => {
        const filterId = filter.id;
        const data = {
          get filter() {
            return findFilter(props.value, filterId);
          },
        };
        if (filter.type === "composite") {
          nodes.push(defineTreeFolder({ id: filter.id, children: filter.children.map((child) => child.id), data }));
          filter.children.forEach(visit);
        } else nodes.push(defineTreeNode({ id: filter.id, kind: criterionKind, data }));
      };
      visit(props.value);
      return defineTreeModel({ roots: [props.value.id], nodes });
    },
    undefined,
    { equals: sameTreeStructure },
  );
  const replace = (id: FilterNodeId, next: FilterDefinition) =>
    props.onChange(updateFilter(props.value, id, () => next));
  const firstCriterion = () => {
    const attribute = props.attributes[0];
    if (!attribute) return undefined;
    const operator = defaultOperatorForAttribute(attribute, operators());
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
        const movable = filter.id !== props.value.id;
        const invalid = isInvalidOneCompositeFilter(filter);
        return (
          <div
            class={`${styles.group} ${styles[filter.kind]}`}
            classList={{ [styles.disabled]: !!filter.disabled, [styles.invalid]: invalid }}
            aria-invalid={invalid || undefined}
          >
            <FilterDragHandle movable={movable} />
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
              <DeleteFilterButton onClick={() => props.onChange(removeFilter(props.value, filter.id))} />
            </Show>
          </div>
        );
      })
      .register(criterionKind, (node) => (
        <CriterionRow
          filter={node.data.filter as FilterCriterionDefinition}
          attributes={props.attributes}
          operators={operators()}
          movable={String(node.id) !== props.value.id}
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
            dragHandleSelector: "[data-tree-drag-handle]",
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

function sameTreeStructure(previous: TreeModel, next: TreeModel): boolean {
  if (previous.roots.length !== next.roots.length || previous.nodes.size !== next.nodes.size) return false;
  if (previous.roots.some((id, index) => id !== next.roots[index])) return false;
  for (const [id, node] of previous.nodes) {
    const candidate = next.nodes.get(id);
    if (!candidate || candidate.kind !== node.kind) return false;
    const children = node.children ?? [];
    const candidateChildren = candidate.children ?? [];
    if (
      children.length !== candidateChildren.length ||
      children.some((child, index) => child !== candidateChildren[index])
    )
      return false;
  }
  return true;
}

function CriterionRow(props: {
  filter: FilterCriterionDefinition;
  attributes: readonly FilterableAttribute[];
  operators: readonly FilterOperatorDefinition[];
  movable: boolean;
  onChange: (filter: FilterCriterionDefinition) => void;
  onDelete?: () => void;
}) {
  const attribute = () => props.attributes.find((item) => item.id === props.filter.attribute) ?? props.attributes[0];
  const availableOperators = () => (attribute() ? operatorsForAttribute(attribute()!, props.operators) : []);
  const operator = () =>
    availableOperators().find((item) => item.id === props.filter.operator) ?? availableOperators()[0];
  const setOperand = (operand?: FilterOperand) => props.onChange({ ...props.filter, operand });
  const parse = (value: string): FilterValue => (attribute()?.valueType === "int" ? Number(value) : value);
  const selectAttribute = (attributeId: string) => {
    const nextAttribute = props.attributes.find((item) => item.id === attributeId)!;
    const available = operatorsForAttribute(nextAttribute, props.operators);
    const nextOperator =
      available.find((item) => item.id === props.filter.operator) ??
      defaultOperatorForAttribute(nextAttribute, props.operators);
    if (!nextOperator) return;
    props.onChange({
      ...props.filter,
      attribute: nextAttribute.id,
      operator: nextOperator.id,
      operand: emptyOperand(nextOperator, nextAttribute),
    });
  };
  return (
    <div class={styles.criterion} classList={{ [styles.disabled]: !!props.filter.disabled }}>
      <FilterDragHandle movable={props.movable} />
      <input
        type="checkbox"
        aria-label="Enable criterion"
        checked={!props.filter.disabled}
        onChange={() => props.onChange({ ...props.filter, disabled: !props.filter.disabled || undefined })}
      />
      <Select
        ariaLabel="Filter attribute"
        value={props.filter.attribute}
        onChange={selectAttribute}
        loadEntries={async () => ({ entries: props.attributes, total: props.attributes.length })}
        entryId={(item) => item.id}
        entryText={(item) => item.label}
        renderEntry={(item) => (
          <div class={styles.attributeEntry}>
            <div>
              <strong>{item.label}</strong>
              <code>{item.valueType}</code>
            </div>
            <Show when={item.description}>
              <span>{item.description}</span>
            </Show>
          </div>
        )}
        density="compact"
        placeholder="Choose attribute"
      />
      <select
        aria-label="Comparison operator"
        value={operator()?.id}
        onChange={(event) => {
          const next = availableOperators().find((item) => item.id === event.currentTarget.value)!;
          props.onChange({
            ...props.filter,
            operator: next.id,
            operand: operandForOperator(next, attribute()!, props.filter.operand),
          });
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
        <DeleteFilterButton onClick={props.onDelete!} />
      </Show>
    </div>
  );
}

function FilterDragHandle(props: { readonly movable: boolean }) {
  return (
    <span
      class={styles.dragHandle}
      classList={{ [styles.dragHandleSpacer]: !props.movable }}
      data-tree-drag-handle={props.movable ? "" : undefined}
      draggable={props.movable || undefined}
      aria-hidden="true"
    >
      <GripVerticalIcon size={14} />
    </span>
  );
}

function DeleteFilterButton(props: { readonly onClick: () => void }) {
  const tooltipId = `delete-filter-${createUniqueId()}`;
  return (
    <button
      type="button"
      class={styles.deleteButton}
      aria-label="Delete filter"
      aria-describedby={tooltipId}
      onClick={props.onClick}
    >
      <span aria-hidden="true">×</span>
      <span id={tooltipId} role="tooltip" class={styles.deleteTooltip}>
        Delete filter
      </span>
    </button>
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
        density="compact"
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

function defaultOperatorForAttribute(
  attribute: FilterableAttribute,
  operators: readonly FilterOperatorDefinition[],
): FilterOperatorDefinition | undefined {
  const available = operatorsForAttribute(attribute, operators);
  return available.find((operator) => operator.id === containsFilterOperator) ?? available[0];
}

function operandForOperator(
  operator: FilterOperatorDefinition,
  attribute: FilterableAttribute,
  current: FilterOperand | undefined,
): FilterOperand | undefined {
  if (operator.operand === "none") return undefined;
  return current?.type === operator.operand ? current : emptyOperand(operator, attribute);
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
