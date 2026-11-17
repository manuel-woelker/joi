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
    /// Named enumerations used by entity attributes.
    #[serde(default)]
    pub enums: Vec<DomainEnum>,
    /// Entity definitions in the domain.
    pub entities: Vec<DomainEntity>,
}

/// A named set of allowed values in a domain model.
#[derive(Debug, Deserialize)]
pub struct DomainEnum {
    /// Enum name within its domain.
    pub name: String,
    /// Human-readable enum description.
    pub description: Option<String>,
    /// Allowed values in declaration order.
    pub values: Vec<DomainEnumValue>,
}

/// One allowed value in a domain enum.
#[derive(Debug, Deserialize)]
pub struct DomainEnumValue {
    /// Stable value name.
    pub name: String,
    /// Human-readable value description.
    pub description: Option<String>,
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
    /// Numeric value, including fractional values.
    Number,
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
    /// Reference to a named enumeration in the same domain.
    Enum {
        /// Referenced enum name.
        enumeration: String,
    },
}

impl DomainType {
    /// Formats a type for model inspection.
    pub fn display(&self) -> String {
        match self {
            Self::String => "string".into(),
            Self::Number => "number".into(),
            Self::Date => "date".into(),
            Self::DateRange => "date range".into(),
            Self::Set { element } => format!("set<{}>", element.display()),
            Self::Ref { entity } => format!("ref<{entity}>"),
            Self::Enum { enumeration } => format!("enum<{enumeration}>"),
        }
    }

    fn validate_references(
        &self,
        entities: &HashSet<&str>,
        enums: &HashSet<&str>,
    ) -> JoiResult<()> {
        match self {
            Self::Set { element } => element.validate_references(entities, enums),
            Self::Ref { entity } if !entities.contains(entity.as_str()) => {
                Err(joi_error!("unknown domain entity reference: {entity}"))
            }
            Self::Enum { enumeration } if !enums.contains(enumeration.as_str()) => {
                Err(joi_error!("unknown domain enum reference: {enumeration}"))
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
    let mut enum_names = HashSet::new();
    for enumeration in &model.enums {
        if enumeration.name.trim().is_empty() || !enum_names.insert(enumeration.name.as_str()) {
            return Err(joi_error!(
                "duplicate or empty enum name in {domain}: {}",
                enumeration.name
            ));
        }
        if enumeration.values.is_empty() {
            return Err(joi_error!(
                "enum {domain}.{} has no values",
                enumeration.name
            ));
        }
        let mut values = HashSet::new();
        for value in &enumeration.values {
            if value.name.trim().is_empty() || !values.insert(value.name.as_str()) {
                return Err(joi_error!(
                    "duplicate or empty value in enum {domain}.{}: {}",
                    enumeration.name,
                    value.name
                ));
            }
        }
    }
    for entity in &model.entities {
        if entity.name.trim().is_empty()
            || enum_names.contains(entity.name.as_str())
            || !names.insert(entity.name.as_str())
        {
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
            attribute
                .data_type
                .validate_references(&names, &enum_names)?;
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
                    r#"{"version":1,"enums":[{"name":"Method","values":[{"name":"verbal"},{"name":"written"}]}],"entities":[{"name":"Student","attributes":[]},{"name":"Class","attributes":[{"name":"students","type":{"kind":"set","element":{"kind":"ref","entity":"Student"}}},{"name":"method","type":{"kind":"enum","enumeration":"Method"}}]}]}"#,
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
        assert_eq!(
            model.entities[1].attributes[1].data_type.display(),
            "enum<Method>"
        );
        assert_eq!(model.enums[0].values.len(), 2);
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
        let error = builder.register(plugin("bad-enum", "bad enum", |context| {
            register_domain_model(context, "grades", r#"{"version":1,"entities":[{"name":"Assessment","attributes":[{"name":"method","type":{"kind":"enum","enumeration":"Method"}}]}]}"#)
        }));
        assert!(error.is_err());
    }
}
