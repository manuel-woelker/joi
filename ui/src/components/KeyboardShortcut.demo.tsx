import type { ComponentDemo } from "../playground/demo";
import { KeyboardShortcut } from "./KeyboardShortcut";

const rowStyle = { display: "flex", "align-items": "center", "justify-content": "space-between", gap: "24px" };

export default {
  name: "Keyboard Shortcut",
  description: "Typewriter-style keycaps for displaying single keys and combined keyboard shortcuts.",
  scenarios: [
    {
      name: "Single key",
      description: "A single keycap for a direct command shortcut.",
      render: () => (
        <div style={rowStyle}>
          <span>Open command palette</span>
          <KeyboardShortcut shortcut="P" />
        </div>
      ),
    },
    {
      name: "Combined keys",
      description: "Modifier and character keys remain visually distinct.",
      render: () => (
        <div style={{ display: "grid", gap: "12px", width: "320px" }}>
          <div style={rowStyle}>
            <span>Copy</span>
            <KeyboardShortcut shortcut="Ctrl+C" />
          </div>
          <div style={rowStyle}>
            <span>Save as</span>
            <KeyboardShortcut shortcut="Ctrl+Shift+S" />
          </div>
          <div style={rowStyle}>
            <span>Zoom in</span>
            <KeyboardShortcut keys={["Ctrl", "+"]} ariaLabel="Control plus Plus" />
          </div>
        </div>
      ),
    },
    {
      name: "Platform labels",
      description: "Key labels are caller-defined and can use platform-specific symbols.",
      render: () => (
        <div style={{ display: "flex", "align-items": "center", gap: "16px" }}>
          <KeyboardShortcut shortcut="⌘+K" ariaLabel="Command K" />
          <KeyboardShortcut shortcut="Alt+F4" />
        </div>
      ),
    },
  ],
} satisfies ComponentDemo;
