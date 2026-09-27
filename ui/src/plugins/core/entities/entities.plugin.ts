import { plugin } from "../../../base/plugin-registry";
import { modelServiceFor, modelServiceKey } from "./model-service";
import { fetchServiceKey } from "../../../base/services/fetch-service";

export default plugin({
  name: "entities",
  description: "Server-owned entity model service",
  requires: { fetchService: fetchServiceKey },
  provides: { models: modelServiceKey },
  initialize({ fetchService }) {
    return { models: modelServiceFor(fetchService) };
  },
});
