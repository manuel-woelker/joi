use crate::runtime::ValueKind;
use crate::schema::PrimitiveType;
use crate::source::SourceSpan;
use crate::template::{Identifier, SubstitutionPath, TemplateSegment};

/// A reusable template fragment declaration.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FragmentDefinition<'a> {
    pub span: SourceSpan,
    pub name: Identifier<'a>,
    pub parameters: Vec<FragmentParameter<'a>>,
    pub body: Vec<TemplateSegment<'a>>,
}

/// A named and typed fragment input.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FragmentParameter<'a> {
    pub span: SourceSpan,
    pub name: Identifier<'a>,
    pub parameter_type: ParameterType,
}

/// A request to render a fragment with named arguments.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FragmentRender<'a> {
    pub span: SourceSpan,
    pub name: Identifier<'a>,
    pub arguments: Vec<NamedArgument<'a>>,
}

/// A named path passed to a fragment parameter.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NamedArgument<'a> {
    pub span: SourceSpan,
    pub name: Identifier<'a>,
    pub value_path: SubstitutionPath<'a>,
}

/// Runtime kinds accepted by fragment parameters.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ParameterType {
    String,
    Boolean,
    Integer,
    Float,
    Struct,
    List,
}

impl ParameterType {
    #[must_use]
    pub fn value_kind(self) -> ValueKind {
        match self {
            Self::String => ValueKind::Primitive(PrimitiveType::String),
            Self::Boolean => ValueKind::Primitive(PrimitiveType::Boolean),
            Self::Integer => ValueKind::Primitive(PrimitiveType::Integer),
            Self::Float => ValueKind::Primitive(PrimitiveType::Float),
            Self::Struct => ValueKind::Struct,
            Self::List => ValueKind::List,
        }
    }
}
