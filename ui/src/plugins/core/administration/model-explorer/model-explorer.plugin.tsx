import BoxesIcon from "lucide-solid/icons/boxes";

import { plugin } from "../../../../base/plugin-registry";
import { fetchServiceKey } from "../../../../base/services/fetch-service";
import { administrationContributions } from "../contribution";
import { ModelExplorer } from "./ModelExplorer";

export default plugin({
  name: "model-explorer",
  description: "Explores server-side application models",
  requires: { fetchService: fetchServiceKey },
  registerExtensions(context) {
    context.registerExtension({
      point: administrationContributions,
      id: "model-explorer",
      description: "Displays model types and their attributes",
      value: {
        id: "model-explorer",
        name: "Model explorer",
        description: "Inspect server-side model types, attributes, and relationships.",
        section: "Administration",
        icon: BoxesIcon,
        content: () => <ModelExplorer fetchService={context.services.fetchService} />,
      },
    });
  },
});
