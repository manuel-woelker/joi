import { cleanup, render, screen } from "@solidjs/testing-library";
import FolderIcon from "lucide-solid/icons/folder";
import { afterEach, describe, expect, it } from "vitest";

import { IconButton } from "./IconButton";

afterEach(cleanup);

describe("IconButton", () => {
  it("renders component icons without leaking presentation props to the button", () => {
    render(() => <IconButton label="Create folder" icon={<FolderIcon size={17} />} />);

    const button = screen.getByRole("button", { name: "Create folder" });
    expect(button.querySelector(".lucide-folder")).toBeTruthy();
    expect(button.hasAttribute("icon")).toBe(false);
    expect(button.hasAttribute("label")).toBe(false);
  });
});
