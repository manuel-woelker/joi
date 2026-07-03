import { render } from "solid-js/web";

import { App } from "./App";
import { loadApiDocumentation } from "./api";
import "./styles.css";

const root = document.querySelector<HTMLElement>("#root");
if (!root) {
  throw new Error("Missing application root");
}

loadApiDocumentation()
  .then((documentation) => {
    document.title = `${documentation.module} API reference`;
    render(() => <App documentation={documentation} />, root);
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    render(
      () => (
        <main class="load-error">
          <p class="eyebrow">Documentation unavailable</p>
          <h1>Unable to load API data</h1>
          <pre>{message}</pre>
        </main>
      ),
      root,
    );
  });
