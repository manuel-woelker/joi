use std::{error::Error, fmt};

use crate::{
    parser::{ParseError, parse_template},
    runtime::{DataError, DataSource, ValueView},
    source::SourceSpan,
    template::TemplateSegment,
};

#[derive(Debug, Default, Clone, Copy)]
pub struct TemplateEngine;

impl TemplateEngine {
    #[must_use]
    pub fn new() -> Self {
        Self
    }

    /// Parses and renders a template using the supplied runtime data.
    pub fn render<D: DataSource>(&self, template: &str, data: &D) -> Result<String, RenderError> {
        let template = parse_template(template).map_err(RenderError::Parse)?;
        let mut output = String::new();

        for segment in template.segments {
            match segment {
                TemplateSegment::Text(text) => output.push_str(text.text.as_ref()),
                TemplateSegment::Substitution(substitution) => {
                    let path = substitution
                        .path
                        .segments
                        .iter()
                        .map(|segment| segment.name.as_ref())
                        .collect::<Vec<_>>();
                    let value = resolve_path(data, &path, substitution.path.span)?;
                    output.push_str(value.as_str().map_err(|source| RenderError::Data {
                        span: substitution.path.span,
                        source,
                    })?);
                }
            }
        }

        Ok(output)
    }
}

pub fn render<D: DataSource>(template: &str, data: &D) -> Result<String, RenderError> {
    TemplateEngine::new().render(template, data)
}

fn resolve_path<'a, D: DataSource>(
    data: &'a D,
    path: &[&str],
    span: SourceSpan,
) -> Result<D::Value<'a>, RenderError> {
    let mut value = data
        .root()
        .map_err(|source| RenderError::Data { span, source })?;

    for segment in path {
        value = value
            .field(segment)
            .map_err(|source| RenderError::Data { span, source })?
            .ok_or_else(|| RenderError::MissingValue {
                path: path.join("."),
                span,
            })?;
    }

    Ok(value)
}

#[derive(Debug, Clone, PartialEq)]
pub enum RenderError {
    Parse(ParseError),
    MissingValue { path: String, span: SourceSpan },
    Data { span: SourceSpan, source: DataError },
}

impl fmt::Display for RenderError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Parse(error) => write!(formatter, "invalid template: {error:?}"),
            Self::MissingValue { path, .. } => write!(formatter, "missing template value `{path}`"),
            Self::Data { source, .. } => write!(formatter, "template data error: {source:?}"),
        }
    }
}

impl Error for RenderError {}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use super::{RenderError, render};
    use crate::{
        runtime::{DataError, NativeDataSource, NativeValue, ValueKind},
        schema::PrimitiveType,
        source::SourceSpan,
    };

    #[test]
    fn renders_paths_utf8_and_literal_braces() {
        let data = NativeDataSource::new(NativeValue::struct_(BTreeMap::from([(
            "model".to_owned(),
            NativeValue::struct_(BTreeMap::from([(
                "name".to_owned(),
                NativeValue::string("Tïcket"),
            )])),
        )])));

        assert_eq!(
            render("pub struct {model.name} {{}}", &data),
            Ok("pub struct Tïcket {}".to_owned())
        );
    }

    #[test]
    fn reports_missing_values_with_substitution_span() {
        let data = NativeDataSource::new(NativeValue::struct_(BTreeMap::new()));

        assert_eq!(
            render("Hi {user.name}", &data),
            Err(RenderError::MissingValue {
                path: "user.name".to_owned(),
                span: SourceSpan::from_range(4, 13),
            })
        );
    }

    #[test]
    fn reports_non_string_values_with_substitution_span() {
        let data = NativeDataSource::new(NativeValue::struct_(BTreeMap::from([(
            "count".to_owned(),
            NativeValue::integer(2),
        )])));

        assert_eq!(
            render("{count}", &data),
            Err(RenderError::Data {
                span: SourceSpan::from_range(1, 6),
                source: DataError::TypeMismatch {
                    expected: "string",
                    actual: ValueKind::Primitive(PrimitiveType::Integer),
                },
            })
        );
    }
}
