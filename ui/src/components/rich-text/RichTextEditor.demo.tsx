import { createSignal, onCleanup } from "solid-js";

import type { ComponentDemo } from "../../plugins/core/playground/demo";
import { RichTextEditor } from "./RichTextEditor";
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
  ],
} satisfies ComponentDemo;
