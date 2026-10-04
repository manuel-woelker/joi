export default {
  forbidden: [
    {
      name: "domain-plugins-are-independent",
      severity: "error",
      comment: "Domain plugins communicate through core extension points and services, not imports.",
      from: { path: "^ui/src/plugins/(?!core/)([^/]+)/" },
      to: {
        path: "^ui/src/plugins/(?!core/)[^/]+/",
        pathNot: "^ui/src/plugins/$1/",
      },
    },
    {
      name: "core-does-not-import-domains",
      severity: "error",
      from: { path: "^ui/src/plugins/core/" },
      to: { path: "^ui/src/plugins/(?!core/)[^/]+/" },
    },
  ],
  options: {
    includeOnly: "^ui/src/",
    tsPreCompilationDeps: true,
  },
};
