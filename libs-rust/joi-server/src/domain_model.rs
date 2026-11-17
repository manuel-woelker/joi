//! Parsed domain definitions embedded by Rust plugins at compile time.

use std::collections::HashSet;

use joi_error::{JoiResult, joi_error, report};
use joi_plugin::PluginContext;
use serde::Deserialize;

/// A model contributed by a domain plugin, independent of storage tables.
#[derive(Debug, Deserialize)]
pub struct DomainModel {
    /// Stable domain namespace.
    #[serde(skip)]
    pub domain: String,
    /// JSON format version.
    pub version: u32,
    /// Entity definitions in the domain.
    pub entities: Vec<DomainEntity>,
}

/// An entity in a domain model.
#[derive(Debug, Deserialize)]
pub struct DomainEntity {
    /// Entity name within its domain.
    pub name: String,
    /// Human-readable entity description.
    pub description: Option<String>,
    /// Attributes in declaration order.
    pub attributes: Vec<DomainAttribute>,
}

/// An attribute in a domain entity.
#[derive(Debug, Deserialize)]
pub struct DomainAttribute {
    /// Attribute name.
    pub name: String,
    /// Human-readable attribute description.
    pub description: Option<String>,
    /// Attribute type, including nested sets and references.
    #[serde(rename = "type")]
    pub data_type: DomainType,
}

/// Types supported by the TypeScript domain definition contract.
#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum DomainType {
    /// Text value.
    String,
    /// Calendar date.
    Date,
    /// Start and end dates.
    DateRange,
    /// Collection of values.
    Set {
        /// Type of each member.
        element: Box<DomainType>,
    },
    /// Reference to another entity in the same domain.
    Ref {
        /// Referenced entity name within this domain.
        entity: String,
    },
}

impl DomainType {
    /// Formats a type for model inspection.
    pub fn display(&self) -> String {
        match self {
            Self::String => "string".into(),
            Self::Date => "date".into(),
            Self::DateRange => "date range".into(),
            Self::Set { element } => format!("set<{}>", element.display()),
            Self::Ref { entity } => format!("ref<{entity}>"),
        }
    }

    fn validate_references(&self, names: &HashSet<&str>) -> JoiResult<()> {
        match self {
            Self::Set { element } => element.validate_references(names),
            Self::Ref { entity } if !names.contains(entity.as_str()) => {
                Err(joi_error!("unknown domain entity reference: {entity}"))
            }
            _ => Ok(()),
        }
    }
}

/// Extension point for domain models, separate from table descriptions.
pub trait DomainModelProvider: Send + Sync {
    /// Returns the validated model owned by this plugin.
    fn domain_model(&self) -> &DomainModel;
}

impl DomainModelProvider for DomainModel {
    fn domain_model(&self) -> &DomainModel {
        self
    }
}

/// Validates embedded JSON and registers it under the given domain namespace.
#[track_caller]
pub fn register_domain_model(
    context: &mut PluginContext<'_>,
    domain: &str,
    json: &'static str,
) -> JoiResult<()> {
    if domain.trim().is_empty() {
        return Err(joi_error!("domain name must not be empty"));
    }
    let mut model: DomainModel = serde_json::from_str(json).map_err(report)?;
    model.domain = domain.to_owned();
    if model.version != 1 {
        return Err(joi_error!(
            "unsupported domain model version: {}",
            model.version
        ));
    }
    let mut names = HashSet::new();
    for entity in &model.entities {
        if entity.name.trim().is_empty() || !names.insert(entity.name.as_str()) {
            return Err(joi_error!(
                "duplicate or empty entity name in {domain}: {}",
                entity.name
            ));
        }
        let mut attributes = HashSet::new();
        for attribute in &entity.attributes {
            if attribute.name.trim().is_empty() || !attributes.insert(attribute.name.as_str()) {
                return Err(joi_error!(
                    "duplicate or empty attribute name in {domain}.{}: {}",
                    entity.name,
                    attribute.name
                ));
            }
        }
    }
    for entity in &model.entities {
        for attribute in &entity.attributes {
            attribute.data_type.validate_references(&names)?;
        }
    }
    context.register_extension::<dyn DomainModelProvider>(
        format!("domain-model:{domain}"),
        format!("Defines the {domain} domain model"),
        Box::new(model),
    )
}

#[cfg(test)]
mod tests {
    use joi_plugin::{PluginRegistryBuilder, plugin};

    use super::{DomainModelProvider, register_domain_model};

    #[test]
    fn registers_embedded_model_with_nested_references() {
        let mut builder = PluginRegistryBuilder::new();
        builder
            .register(plugin("base", "base", |context| {
                context.register_extension_point::<dyn DomainModelProvider>(
                    "domain-models",
                    "Domain models",
                )
            }))
            .unwrap();
        builder
            .register(plugin("grades", "grades", |context| {
                register_domain_model(
                    context,
                    "grades",
                    r#"{"version":1,"entities":[{"name":"Student","attributes":[]},{"name":"Class","attributes":[{"name":"students","type":{"kind":"set","element":{"kind":"ref","entity":"Student"}}}]}]}"#,
                )
            }))
            .unwrap();
        let registry = builder.build();
        let model = registry
            .extensions::<dyn DomainModelProvider>()
            .unwrap()
            .next()
            .unwrap()
            .domain_model();
        assert_eq!(model.domain, "grades");
        assert_eq!(
            model.entities[1].attributes[0].data_type.display(),
            "set<ref<Student>>"
        );
    }

    #[test]
    fn rejects_unsupported_versions_and_missing_references() {
        let mut builder = PluginRegistryBuilder::new();
        builder
            .register(plugin("base", "base", |context| {
                context.register_extension_point::<dyn DomainModelProvider>(
                    "domain-models",
                    "Domain models",
                )
            }))
            .unwrap();
        let error = builder.register(plugin("bad", "bad", |context| {
            register_domain_model(context, "grades", r#"{"version":2,"entities":[]}"#)
        }));
        assert!(error.is_err());
        let error = builder.register(plugin("bad-ref", "bad ref", |context| {
            register_domain_model(context, "grades", r#"{"version":1,"entities":[{"name":"Class","attributes":[{"name":"students","type":{"kind":"ref","entity":"Student"}}]}]}"#)
        }));
        assert!(error.is_err());
    }
}
