import { createSignal, onCleanup } from "solid-js";

import type { ComponentDemo } from "../../plugins/core/playground/demo";
import { RichTextEditor } from "./RichTextEditor";
import type { LinkPickerSource } from "./link-picker";
import styles from "./RichTextEditor.demo.module.css";

const initialDocument = `<h2>Release notes</h2><p>The new review flow is ready for testing.</p><ul><li>Open a commit</li><li>Add line comments</li><li>Request a review</li></ul>`;

function BasicScenario() {
  const [html, setHtml] = createSignal(initialDocument);
  return (
    <div class={styles.demo}>
      <RichTextEditor ariaLabel="Release notes" value={html()} onChange={setHtml} />
    </div>
  );
}

function ReadOnlyScenario() {
  return (
    <div class={styles.demo}>
      <RichTextEditor ariaLabel="Published release notes" value={initialDocument} readOnly />
    </div>
  );
}

function ConfigurableHeadingsScenario() {
  const [html, setHtml] = createSignal(
    "<h2>Compact document structure</h2><p>Only levels two and three are available.</p>",
  );
  return (
    <div class={styles.demo}>
      <RichTextEditor
        ariaLabel="Document with restricted headings"
        value={html()}
        onChange={setHtml}
        headingLevels={[2, 3]}
      />
    </div>
  );
}

function HeadingsDisabledScenario() {
  const [html, setHtml] = createSignal(
    "<p>This editor supports paragraphs and inline formatting without headings.</p>",
  );
  return (
    <div class={styles.demo}>
      <RichTextEditor ariaLabel="Document without headings" value={html()} onChange={setHtml} headingLevels={false} />
    </div>
  );
}

function AutosaveScenario() {
  const [html, setHtml] = createSignal(initialDocument);
  const [savedHtml, setSavedHtml] = createSignal(initialDocument);
  const [status, setStatus] = createSignal("Saved");
  let saveTimer: number | undefined;

  const update = (nextHtml: string) => {
    setHtml(nextHtml);
    setStatus("Unsaved changes - saving in 5 seconds");
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      setSavedHtml(nextHtml);
      setStatus(`Saved at ${new Date().toLocaleTimeString()}`);
    }, 5_000);
  };
  onCleanup(() => window.clearTimeout(saveTimer));

  return (
    <div class={styles.demo}>
      <RichTextEditor ariaLabel="Autosaved document" value={html()} onChange={update} />
      <div class={styles.statusRow} aria-live="polite">
        <strong>Autosave</strong>
        <span>{status()}</span>
      </div>
      <section class={styles.htmlPanel}>
        <h3>Current HTML</h3>
        <pre>{html()}</pre>
      </section>
      <section class={styles.htmlPanel}>
        <h3>Last saved HTML</h3>
        <pre>{savedHtml()}</pre>
      </section>
    </div>
  );
}

const linkCandidates = [
  { reference: "wiki:Start", label: "Start", description: "Wiki page", href: "#:wiki:Start" },
  {
    reference: "ticket:TEST-42",
    label: "Improve navigation",
    description: "Ticket TEST-42",
    href: "#/entity?entity=ticket%3ATEST-42",
  },
  {
    reference: "user:jane",
    label: "Jane Developer",
    description: "User jane",
    href: "#/entity?entity=users%3Ajane-id",
  },
];

function linkSource(delay = 0, fail = false): LinkPickerSource {
  return {
    async search(query, signal) {
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      if (signal.aborted) return { entries: [], errors: [] };
      if (fail) return { entries: [], errors: ["Search unavailable. Retry shortly."] };
      return {
        entries: linkCandidates
          .filter((entry) => `${entry.reference} ${entry.label}`.toLowerCase().includes(query.toLowerCase()))
          .slice(0, 20),
        errors: [],
      };
    },
    async resolve(references) {
      return references.map((reference) => linkCandidates.find((entry) => entry.reference === reference));
    },
  };
}

function InternalLinksScenario(props: { readonly delay?: number; readonly fail?: boolean; readonly initial?: string }) {
  const [html, setHtml] = createSignal(props.initial ?? "<p>Link a wiki page, ticket, or person here.</p>");
  return (
    <div class={styles.demo}>
      <RichTextEditor
        ariaLabel="Linked document"
        value={html()}
        onChange={setHtml}
        links={linkSource(props.delay, props.fail)}
      />
      <section class={styles.htmlPanel}>
        <h3>HTML</h3>
        <pre>{html()}</pre>
      </section>
    </div>
  );
}

export default {
  name: "Rich text editor",
  description: "Edits structured text through a controlled, HTML-based component API.",
  scenarios: [
    {
      name: "Basic editing",
      description: "Formats headings, inline text, lists, and quotations.",
      render: () => <BasicScenario />,
    },
    {
      name: "Read only",
      description: "Displays rich content without editing controls.",
      render: () => <ReadOnlyScenario />,
    },
    {
      name: "Configurable headings",
      description: "Restricts the heading selector to levels two and three.",
      render: () => <ConfigurableHeadingsScenario />,
    },
    {
      name: "Headings disabled",
      description: "Removes headings while retaining paragraph and inline formatting controls.",
      render: () => <HeadingsDisabledScenario />,
    },
    {
      name: "Debounced autosave",
      description: "Saves five seconds after the latest edit and exposes the current and persisted HTML.",
      render: () => <AutosaveScenario />,
    },
    {
      name: "Internal links",
      description: "Search targets with the toolbar or type [[wiki:Start]].",
      render: () => <InternalLinksScenario />,
    },
    {
      name: "Explicit labels",
      description: "Use [[ticket:TEST-42|custom text]] to choose a visible label.",
      render: () => <InternalLinksScenario initial="<p>Use [[ticket:TEST-42|custom text]] here.</p>" />,
    },
    {
      name: "Slow search",
      description: "Delays results while a remote provider responds.",
      render: () => <InternalLinksScenario delay={1000} />,
    },
    {
      name: "Search failure",
      description: "Shows a retryable provider error.",
      render: () => <InternalLinksScenario fail />,
    },
    {
      name: "Missing target",
      description: "Unknown short-form references remain text.",
      render: () => <InternalLinksScenario initial="<p>[[wiki:Removed]] remains readable.</p>" />,
    },
    {
      name: "External link",
      description: "Ordinary URLs use the existing link control.",
      render: () => (
        <InternalLinksScenario initial={'<p><a href="https://example.org">External documentation</a></p>'} />
      ),
    },
    {
      name: "Many links",
      description: "A document containing many internal references.",
      render: () => (
        <InternalLinksScenario
          initial={`<p>${Array.from({ length: 30 }, (_, index) => `<a href="#:wiki:Start" data-joi-ref="wiki:Start">Start ${index + 1}</a>`).join(" | ")}</p>`}
        />
      ),
    },
  ],
} satisfies ComponentDemo;
