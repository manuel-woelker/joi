// @vitest-environment happy-dom

import { fireEvent, render, screen } from "@solidjs/testing-library";
import { expect, it } from "vitest";

import { createApplication } from "../../../../base/application-registry";
import { DebugTools } from "../core/DebugTools";
import { ExtensionInspectorProvider, ExtensionInspectorService } from "../inspector/extension-inspector";

it("links to the standalone viewer from the debug tools", () => {
  const { registry } = createApplication();
  render(() => (
    <ExtensionInspectorProvider service={new ExtensionInspectorService()}>
      <DebugTools registry={registry} />
    </ExtensionInspectorProvider>
  ));

  fireEvent.click(screen.getByRole("button", { name: "Open debug tools" }));
  fireEvent.click(screen.getByRole("button", { name: "Architecture" }));

  const link = screen.getByRole("link", { name: "Open architecture browser (new tab)" });
  expect(link.getAttribute("href")).toBe("/architecture/index.html");
  expect(link.getAttribute("target")).toBe("_blank");
});
