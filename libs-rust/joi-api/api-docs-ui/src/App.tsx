import { For, Show, createMemo, createSignal } from "solid-js";
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
                <For each={models()}>{(model) => <ModelReference model={model} />}</For>
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
                  {(operation) => <OperationReference operation={operation} />}
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

function ModelReference(props: { model: ApiModel }) {
  return (
    <article id={`model-${props.model.name}`} class="model-card">
      <header>
        <span class="kind-label model">model</span>
        <h3>{props.model.name}</h3>
        <Show when={props.model.description}>
          <p>{props.model.description}</p>
        </Show>
      </header>
      <FieldTable fields={props.model.fields} emptyLabel="No fields" />
    </article>
  );
}

function OperationReference(props: { operation: ApiOperation }) {
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
        <FieldGroup title="Parameters" fields={props.operation.parameters} emptyLabel="None" />
        <FieldGroup title="Returns" fields={props.operation.returns} emptyLabel="No value" />
      </div>
    </article>
  );
}

function FieldGroup(props: { title: string; fields: ApiField[]; emptyLabel: string }) {
  return (
    <section class="field-group">
      <h4>{props.title}</h4>
      <FieldTable fields={props.fields} emptyLabel={props.emptyLabel} />
    </section>
  );
}

function FieldTable(props: { fields: ApiField[]; emptyLabel: string }) {
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
              <dd><TypeReference type={field.type} /></dd>
            </div>
          )}
        </For>
      </dl>
    </Show>
  );
}

function TypeReference(props: { type: ApiType }) {
  return (
    <code class="type-reference">
      {props.type.name}
      <Show when={props.type.arguments.length > 0}>
        &lt;
        <For each={props.type.arguments}>
          {(argument, index) => (
            <>
              <Show when={index() > 0}>, </Show>
              {argument.kind === "type" ? (
                <TypeReference type={argument.value} />
              ) : (
                <span class="string-literal">"{argument.value}"</span>
              )}
            </>
          )}
        </For>
        &gt;
      </Show>
    </code>
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
