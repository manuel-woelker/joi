//! Collects self-described software components into a serializable graph.

#![warn(missing_docs)]

use std::{
    collections::{BTreeMap, BTreeSet},
    fmt,
};

use serde::Serialize;
use serde_json::{Number, Value};

/// A live component that contributes a single node to an architecture graph.
pub trait ArchitectureComponent {
    /// Registers this component and delegates descriptions of related components.
    ///
    /// Call [`ArchitectureContext::component`] exactly once and propagate errors.
    /// Registration can be repeated across visits. Put detail collection in the
    /// registration callback, which runs only once per graph.
    fn describe<'a>(
        &'a self,
        context: &mut ArchitectureContext<'_, 'a>,
    ) -> Result<(), ArchitectureError>;
}

/// A failure to collect a complete and unambiguous architecture graph.
#[derive(Debug, PartialEq, Eq)]
pub enum ArchitectureError {
    /// A required field was blank.
    BlankField(&'static str),
    /// Different components claimed the same ID.
    DuplicateId(String),
    /// A component returned without registering itself.
    MissingRegistration,
    /// A component registered itself more than once in a single visit.
    MultipleRegistrations,
}

impl fmt::Display for ArchitectureError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::BlankField(field) => write!(formatter, "architecture {field} must not be blank"),
            Self::DuplicateId(id) => {
                write!(formatter, "duplicate architecture component ID `{id}`")
            }
            Self::MissingRegistration => {
                write!(formatter, "component did not register a description")
            }
            Self::MultipleRegistrations => write!(formatter, "component registered more than once"),
        }
    }
}

impl std::error::Error for ArchitectureError {}

/// A snapshot of the components reachable from the supplied roots.
#[derive(Debug, Serialize)]
pub struct ArchitectureGraph {
    /// Components in stable ID order.
    pub components: Vec<Component>,
}

impl ArchitectureGraph {
    /// Collects a fresh graph from the supplied roots.
    ///
    /// Use stable IDs and refer to the same instance wherever a component is
    /// shared. Rust gives zero-sized values no distinct allocation identity.
    /// Give separately identified instances nonzero storage when their types
    /// would otherwise be zero-sized.
    pub fn collect<'a>(
        roots: impl IntoIterator<Item = &'a dyn ArchitectureComponent>,
    ) -> Result<Self, ArchitectureError> {
        let mut collector = Collector::default();
        for root in roots {
            collector.visit(root)?;
        }
        Ok(Self {
            components: collector
                .entries
                .into_values()
                .map(|entry| entry.node)
                .collect(),
        })
    }
}

/// A component's metadata, optional values, and outgoing relationships.
#[derive(Debug, Serialize)]
pub struct Component {
    /// Stable identifier unique within the graph.
    pub id: String,
    /// Human-readable name.
    pub label: String,
    /// What the component does.
    pub description: String,
    /// Named configuration values selected for publication.
    #[serde(skip_serializing_if = "BTreeMap::is_empty")]
    pub config: BTreeMap<String, Value>,
    /// Named numeric snapshots.
    #[serde(skip_serializing_if = "BTreeMap::is_empty")]
    pub metrics: BTreeMap<String, Number>,
    /// Outgoing relationships sorted by kind and target ID.
    #[serde(skip_serializing_if = "BTreeSet::is_empty")]
    pub relationships: BTreeSet<Relationship>,
}

/// A directed relationship to a component in the same graph.
#[derive(Debug, Eq, Ord, PartialEq, PartialOrd, Serialize)]
pub struct Relationship {
    /// Relationship name, such as `uses`.
    pub kind: String,
    /// ID of the related component.
    pub target_id: String,
}

#[derive(Default)]
struct Collector<'a> {
    entries: BTreeMap<String, Entry<'a>>,
}

struct Entry<'a> {
    instance: &'a dyn ArchitectureComponent,
    node: Component,
}

impl<'a> Collector<'a> {
    fn visit(
        &mut self,
        instance: &'a dyn ArchitectureComponent,
    ) -> Result<String, ArchitectureError> {
        let mut context = ArchitectureContext {
            collector: self,
            instance,
            id: None,
        };
        instance.describe(&mut context)?;
        context.id.ok_or(ArchitectureError::MissingRegistration)
    }
}

/// The registration context supplied to one invocation of a component description.
pub struct ArchitectureContext<'collector, 'component> {
    collector: &'collector mut Collector<'component>,
    instance: &'component dyn ArchitectureComponent,
    id: Option<String>,
}

impl<'a> ArchitectureContext<'_, 'a> {
    /// Registers required metadata and runs `describe_details` on the first visit.
    pub fn component(
        &mut self,
        id: &str,
        label: &str,
        description: &str,
        describe_details: impl FnOnce(&mut ComponentDetails<'_, 'a>) -> Result<(), ArchitectureError>,
    ) -> Result<(), ArchitectureError> {
        if self.id.is_some() {
            return Err(ArchitectureError::MultipleRegistrations);
        }
        for (name, value) in [("ID", id), ("label", label), ("description", description)] {
            require_value(name, value)?;
        }
        self.id = Some(id.to_owned());
        if let Some(entry) = self.collector.entries.get(id) {
            if std::ptr::addr_eq(entry.instance, self.instance)
                && entry.node.label == label
                && entry.node.description == description
            {
                return Ok(());
            }
            return Err(ArchitectureError::DuplicateId(id.to_owned()));
        }
        self.collector.entries.insert(
            id.to_owned(),
            Entry {
                instance: self.instance,
                node: Component {
                    id: id.to_owned(),
                    label: label.to_owned(),
                    description: description.to_owned(),
                    config: BTreeMap::new(),
                    metrics: BTreeMap::new(),
                    relationships: BTreeSet::new(),
                },
            },
        );
        describe_details(&mut ComponentDetails {
            collector: self.collector,
            id,
        })
    }
}

/// Adds optional values and follows relationships from a registered component.
pub struct ComponentDetails<'collector, 'component> {
    collector: &'collector mut Collector<'component>,
    id: &'collector str,
}

impl<'a> ComponentDetails<'_, 'a> {
    /// Sets a named configuration value. A later call with the same name replaces it.
    pub fn config(&mut self, name: impl Into<String>, value: impl Into<Value>) {
        self.node().config.insert(name.into(), value.into());
    }

    /// Sets a named numeric snapshot. A later call with the same name replaces it.
    pub fn metric(&mut self, name: impl Into<String>, value: impl Into<Number>) {
        self.node().metrics.insert(name.into(), value.into());
    }

    /// Describes a related component and records a directed relationship to it.
    pub fn relate(
        &mut self,
        kind: &str,
        target: &'a dyn ArchitectureComponent,
    ) -> Result<(), ArchitectureError> {
        require_value("relationship kind", kind)?;
        let target_id = self.collector.visit(target)?;
        self.node().relationships.insert(Relationship {
            kind: kind.to_owned(),
            target_id,
        });
        Ok(())
    }

    fn node(&mut self) -> &mut Component {
        &mut self
            .collector
            .entries
            .get_mut(self.id)
            .expect("current component is registered")
            .node
    }
}

fn require_value(field: &'static str, value: &str) -> Result<(), ArchitectureError> {
    if value.trim().is_empty() {
        return Err(ArchitectureError::BlankField(field));
    }
    Ok(())
}
