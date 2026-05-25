/// A minimal entry point for template rendering while the engine is still being built out.
#[derive(Debug, Default, Clone, Copy)]
pub struct TemplateEngine;

impl TemplateEngine {
    /// Creates a new template engine instance.
    #[must_use]
    pub fn new() -> Self {
        Self
    }

    /// Renders a template string.
    ///
    /// The current implementation is intentionally minimal and returns the template unchanged.
    #[must_use]
    pub fn render(&self, template: &str) -> String {
        template.to_owned()
    }
}

/// Renders a template string with the default engine.
#[must_use]
pub fn render(template: &str) -> String {
    TemplateEngine::new().render(template)
}

#[cfg(test)]
mod tests {
    use super::{TemplateEngine, render};

    #[test]
    fn render_returns_template_text() {
        assert_eq!(render("hello"), "hello");
    }

    #[test]
    fn engine_render_returns_template_text() {
        let engine = TemplateEngine::new();

        assert_eq!(engine.render("{{ name }}"), "{{ name }}");
    }
}
