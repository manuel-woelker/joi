import { For, Show, createMemo, createSignal, createUniqueId } from "solid-js";
import type { ParentProps } from "solid-js";

import type {
  ApiDocumentation,
  ApiField,
  ApiModel,
  ApiOperation,
  ApiType,
} from "./api";

interface AppProps {
  documentation: ApiDocumentation;
}

const builtinTypeDescriptions: Readonly<Record<string, string>> = {
  string: "A text value.",
  id: "A nominal identifier associated with a specific model.",
  list: "An ordered sequence of values.",
  optional: "A value that may be absent.",
  partialExcept: "A model shape where every field is optional except the named field.",
};

export function App(props: AppProps) {
  const [filter, setFilter] = createSignal("");
  const normalizedFilter = createMemo(() => filter().trim().toLowerCase());
  const models = createMemo(() =>
    props.documentation.models.filter((model) => matchesModel(model, normalizedFilter())),
  );
  const operations = createMemo(() =>
    props.documentation.operations.filter((operation) =>
      matchesOperation(operation, normalizedFilter()),
    ),
  );
  const navigateToModel = (name: string) => {
    setFilter("");
    queueMicrotask(() => {
      window.location.hash = `model-${name}`;
    });
  };

  return (
    <div class="app-shell">
      <aside class="sidebar">
        <a class="brand" href="#overview" aria-label={`${props.documentation.module} overview`}>
          <span class="brand-mark">J</span>
          <span>
            <strong>{props.documentation.module}</strong>
            <small>API reference</small>
          </span>
        </a>

        <label class="search">
          <span class="visually-hidden">Filter API documentation</span>
          <input
            type="search"
            placeholder="Filter reference"
            value={filter()}
            onInput={(event) => setFilter(event.currentTarget.value)}
          />
        </label>

        <nav aria-label="API reference">
          <NavGroup title="Models">
            <For each={models()}>
              {(model) => <a href={`#model-${model.name}`}>{model.name}</a>}
            </For>
          </NavGroup>
          <NavGroup title="Operations">
            <For each={operations()}>
              {(operation) => (
                <a href={`#operation-${operation.name}`}>
                  <span class={`nav-kind ${operation.kind}`}>{operation.kind[0]}</span>
                  {operation.name}
                </a>
              )}
            </For>
          </NavGroup>
        </nav>

        <div class="sidebar-meta">Schema v{props.documentation.schemaVersion}</div>
      </aside>

      <main class="content">
        <header id="overview" class="overview">
          <p class="eyebrow">JOI API</p>
          <h1>{props.documentation.module}</h1>
          <Show when={props.documentation.description}>
            <p class="overview-description">{props.documentation.description}</p>
          </Show>
          <div class="overview-stats" aria-label="API summary">
            <span><strong>{props.documentation.models.length}</strong> models</span>
            <span><strong>{props.documentation.operations.length}</strong> operations</span>
          </div>
        </header>

        <Show
          when={models().length > 0 || operations().length > 0}
          fallback={<p class="empty-state">No API entries match “{filter()}”.</p>}
        >
          <Show when={models().length > 0}>
            <section class="reference-section" aria-labelledby="models-heading">
              <div class="section-heading">
                <p class="eyebrow">Data</p>
                <h2 id="models-heading">Models</h2>
              </div>
              <div class="model-grid">
                <For each={models()}>
                  {(model) => (
                    <ModelReference
                      model={model}
                      models={props.documentation.models}
                      onNavigateToModel={navigateToModel}
                    />
                  )}
                </For>
              </div>
            </section>
          </Show>

          <Show when={operations().length > 0}>
            <section class="reference-section" aria-labelledby="operations-heading">
              <div class="section-heading">
                <p class="eyebrow">Interface</p>
                <h2 id="operations-heading">Operations</h2>
              </div>
              <div class="operation-list">
                <For each={operations()}>
                  {(operation) => (
                    <OperationReference
                      operation={operation}
                      models={props.documentation.models}
                      onNavigateToModel={navigateToModel}
                    />
                  )}
                </For>
              </div>
            </section>
          </Show>
        </Show>
      </main>
    </div>
  );
}

function NavGroup(props: ParentProps<{ title: string }>) {
  return (
    <div class="nav-group">
      <h2>{props.title}</h2>
      <div class="nav-links">{props.children}</div>
    </div>
  );
}

interface TypeNavigationProps {
  models: ApiModel[];
  onNavigateToModel: (name: string) => void;
}

function ModelReference(props: { model: ApiModel } & TypeNavigationProps) {
  return (
    <article id={`model-${props.model.name}`} class="model-card">
      <header>
        <span class="kind-label model">model</span>
        <h3>{props.model.name}</h3>
        <Show when={props.model.description}>
          <p>{props.model.description}</p>
        </Show>
      </header>
      <FieldTable
        fields={props.model.fields}
        emptyLabel="No fields"
        models={props.models}
        onNavigateToModel={props.onNavigateToModel}
      />
    </article>
  );
}

function OperationReference(props: { operation: ApiOperation } & TypeNavigationProps) {
  return (
    <article id={`operation-${props.operation.name}`} class="operation">
      <header class="operation-header">
        <span class={`kind-label ${props.operation.kind}`}>{props.operation.kind}</span>
        <h3>{props.operation.name}</h3>
        <Show when={props.operation.description}>
          <p>{props.operation.description}</p>
        </Show>
      </header>
      <div class="operation-signature">
        <FieldGroup
          title="Parameters"
          fields={props.operation.parameters}
          emptyLabel="None"
          models={props.models}
          onNavigateToModel={props.onNavigateToModel}
        />
        <FieldGroup
          title="Returns"
          fields={props.operation.returns}
          emptyLabel="No value"
          models={props.models}
          onNavigateToModel={props.onNavigateToModel}
        />
      </div>
    </article>
  );
}

function FieldGroup(
  props: { title: string; fields: ApiField[]; emptyLabel: string } & TypeNavigationProps,
) {
  return (
    <section class="field-group">
      <h4>{props.title}</h4>
      <FieldTable
        fields={props.fields}
        emptyLabel={props.emptyLabel}
        models={props.models}
        onNavigateToModel={props.onNavigateToModel}
      />
    </section>
  );
}

function FieldTable(props: { fields: ApiField[]; emptyLabel: string } & TypeNavigationProps) {
  return (
    <Show when={props.fields.length > 0} fallback={<p class="empty-value">{props.emptyLabel}</p>}>
      <dl class="field-table">
        <For each={props.fields}>
          {(field) => (
            <div class="field-row">
              <dt>
                <code>{field.name}</code>
                <Show when={field.description}><span>{field.description}</span></Show>
              </dt>
              <dd>
                <TypeReference
                  type={field.type}
                  models={props.models}
                  onNavigateToModel={props.onNavigateToModel}
                />
              </dd>
            </div>
          )}
        </For>
      </dl>
    </Show>
  );
}

function TypeReference(props: { type: ApiType } & TypeNavigationProps) {
  const model = createMemo(() => props.models.find((model) => model.name === props.type.name));
  const builtinDescription = () => builtinTypeDescriptions[props.type.name];

  return (
    <div class="type-reference">
      <Show
        when={model()}
        fallback={
          <Show when={builtinDescription()} fallback={props.type.name}>
            {(description) => (
              <BuiltinTypeName name={props.type.name} description={description()} />
            )}
          </Show>
        }
      >
        {(resolvedModel) => (
          <ModelTypeLink
            model={resolvedModel()}
            onNavigateToModel={props.onNavigateToModel}
          />
        )}
      </Show>
      <Show when={props.type.arguments.length > 0}>
        &lt;
        <For each={props.type.arguments}>
          {(argument, index) => (
            <>
              <Show when={index() > 0}>, </Show>
              {argument.kind === "type" ? (
                <TypeReference
                  type={argument.value}
                  models={props.models}
                  onNavigateToModel={props.onNavigateToModel}
                />
              ) : (
                <span class="string-literal">"{argument.value}"</span>
              )}
            </>
          )}
        </For>
        &gt;
      </Show>
    </div>
  );
}

function BuiltinTypeName(props: { name: string; description: string }) {
  const tooltipId = `type-tooltip-${createUniqueId()}`;

  return (
    <div class="type-token">
      <span class="builtin-type" tabindex="0" aria-describedby={tooltipId}>
        {props.name}
      </span>
      <div id={tooltipId} class="type-tooltip" role="tooltip">
        <strong>{props.name}</strong>
        <span>{props.description}</span>
      </div>
    </div>
  );
}

function ModelTypeLink(props: { model: ApiModel; onNavigateToModel: (name: string) => void }) {
  const tooltipId = `type-tooltip-${createUniqueId()}`;
  const description = () => props.model.description?.trim();

  return (
    <div class="type-token">
      <a
        class="type-link"
        href={`#model-${props.model.name}`}
        aria-describedby={description() ? tooltipId : undefined}
        onClick={(event) => {
          event.preventDefault();
          props.onNavigateToModel(props.model.name);
        }}
      >
        {props.model.name}
      </a>
      <Show when={description()}>
        {(text) => (
          <div id={tooltipId} class="type-tooltip" role="tooltip">
            <strong>{props.model.name}</strong>
            <span>{text()}</span>
          </div>
        )}
      </Show>
    </div>
  );
}

function matchesModel(model: ApiModel, filter: string): boolean {
  return (
    filter.length === 0 ||
    model.name.toLowerCase().includes(filter) ||
    model.fields.some((field) => field.name.toLowerCase().includes(filter))
  );
}

function matchesOperation(operation: ApiOperation, filter: string): boolean {
  return (
    filter.length === 0 ||
    operation.name.toLowerCase().includes(filter) ||
    operation.kind.includes(filter) ||
    [...operation.parameters, ...operation.returns].some((field) =>
      field.name.toLowerCase().includes(filter),
    )
  );
}
