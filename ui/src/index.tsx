import { render } from "solid-js/web";

import { Root } from "./Root";
import "./styles/colors.css";
import "./styles/fonts.css";
import "./styles/reset.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element not found");
}

render(() => <Root />, root);
