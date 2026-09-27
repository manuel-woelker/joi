//! Canonical entity presentation and declarative validation shared with UI clients.
//!
//! Metadata supplements physical table schemas; it never replaces their types or references.
use crate::generated::api::{
    ModelControl, ModelDefaultKind, ModelFieldPresentation, ModelFormat, ModelPresentation,
    ModelValidationKind, ModelValidationRule,
};

/// Starts a read-only field. Enable creation/editing and table display explicitly.
pub fn field(attribute: &str, label: &str) -> ModelFieldPresentation {
    ModelFieldPresentation {
        attribute: attribute.into(),
        label: label.into(),
        control: ModelControl::Text,
        editable: false,
        creatable: false,
        hidden: false,
        default_kind: None,
        default_value: None,
        placeholder: None,
        table: false,
        visible: false,
        width: None,
        format: None,
        facet: false,
        validation: vec![],
    }
}

impl ModelFieldPresentation {
    /// Makes a field editable and available on creation.
    pub fn edit(mut self, control: ModelControl) -> Self {
        self.control = control;
        self.editable = true;
        self.creatable = true;
        self
    }
    /// Offers this column in the table, optionally visible by default.
    pub fn column(mut self, visible: bool, width: Option<i64>) -> Self {
        self.table = true;
        self.visible = visible;
        self.width = width;
        self
    }
    /// Adds a grouped-value facet.
    pub fn facet(mut self) -> Self {
        self.facet = true;
        self
    }
    /// Sets a table cell format independent of the underlying primitive type.
    pub fn format(mut self, format: ModelFormat) -> Self {
        self.format = Some(format);
        self
    }
    /// Supplies a hidden literal on creation.
    pub fn literal(mut self, value: &str) -> Self {
        self.creatable = true;
        self.hidden = true;
        self.default_kind = Some(ModelDefaultKind::Literal);
        self.default_value = Some(value.into());
        self
    }
    /// Generates a KSUID in the generic creation form.
    pub fn ksuid(mut self) -> Self {
        self.creatable = true;
        self.hidden = true;
        self.default_kind = Some(ModelDefaultKind::Ksuid);
        self
    }
    /// Requires a non-empty value on both server and client.
    pub fn required(mut self) -> Self {
        self.validation.push(ModelValidationRule {
            kind: ModelValidationKind::Required,
            pattern: None,
            message: format!("{} is required.", self.label),
        });
        self
    }
    /// Adds a Unicode regex rule. Use syntax supported by both Rust and JavaScript.
    pub fn matches(mut self, pattern: &str, message: &str) -> Self {
        self.validation.push(ModelValidationRule {
            kind: ModelValidationKind::Regex,
            pattern: Some(pattern.into()),
            message: message.into(),
        });
        self
    }
    /// Sets a form placeholder.
    pub fn placeholder(mut self, value: &str) -> Self {
        self.placeholder = Some(value.into());
        self
    }
}

/// Standard presentation of server-maintained timestamps.
pub fn timestamp(attribute: &str, label: &str) -> ModelFieldPresentation {
    field(attribute, label)
        .column(false, Some(190))
        .format(ModelFormat::Date)
}

/// Canonical user form, label, icon and validation rules.
pub fn user_presentation() -> ModelPresentation {
    ModelPresentation {
        route: Some(entity_route("user", "id")),
        label: "User".into(),
        plural_label: "Users".into(),
        label_template: "${name} (${username})".into(),
        icon: "users".into(),
        fields: vec![
            field("id", "ID").ksuid(),
            field("username", "Username")
                .edit(ModelControl::Text)
                .column(true, None)
                .required(),
            field("name", "Name")
                .edit(ModelControl::Text)
                .column(true, None)
                .required()
                .matches(
                    r"^[\p{L}\p{M} .'‘’-]+$",
                    "Use only letters, spaces, periods, and hyphens.",
                ),
        ],
    }
}

/// Declares the public URL type and string attribute used to locate an entity.
pub fn entity_route(entity_type: &str, attribute: &str) -> crate::generated::api::ModelEntityRoute {
    crate::generated::api::ModelEntityRoute {
        r#type: entity_type.into(),
        attribute: attribute.into(),
    }
}
