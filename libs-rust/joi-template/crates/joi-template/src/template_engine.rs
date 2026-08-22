use joi_base::JoiString;
use std::{collections::HashMap, error::Error, fmt};

use crate::{
    parser::{ParseError, parse_template},
    runtime::{DataError, DataSource, ValueKind, ValueView},
    source::SourceSpan,
    template::{FragmentDefinition, SubstitutionPath, TemplateSegment},
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
        let fragments = template
            .fragments
            .iter()
            .map(|fragment| (fragment.name.name.as_ref(), fragment))
            .collect();
        render_segments(&template.segments, &fragments, data, &[], &mut output)?;

        Ok(output)
    }
}

pub fn render<D: DataSource>(template: &str, data: &D) -> Result<String, RenderError> {
    TemplateEngine::new().render(template, data)
}

fn render_segments<'template, 'data, D: DataSource>(
    segments: &[TemplateSegment<'template>],
    fragments: &HashMap<&str, &FragmentDefinition<'template>>,
    data: &'data D,
    scope: &[(&str, D::Value<'data>)],
    output: &mut String,
) -> Result<(), RenderError> {
    for segment in segments {
        match segment {
            TemplateSegment::Text(text) => output.push_str(text.text.as_ref()),
            TemplateSegment::Substitution(substitution) => {
                let value = resolve_path(data, scope, &substitution.path)?;
                output.push_str(value.as_str().map_err(|source| RenderError::Data {
                    span: substitution.path.span,
                    source,
                })?);
            }
            TemplateSegment::FragmentRender(render) => {
                let fragment = fragments[render.name.name.as_ref()];
                let mut parameter_scope = Vec::with_capacity(fragment.parameters.len());
                for parameter in &fragment.parameters {
                    let argument = render
                        .arguments
                        .iter()
                        .find(|argument| argument.name.name == parameter.name.name)
                        .expect("fragment arguments are validated before rendering");
                    let value = resolve_path(data, scope, &argument.value_path)?;
                    let expected = parameter.parameter_type.value_kind();
                    let actual = value.kind();
                    if actual != expected {
                        return Err(RenderError::ArgumentTypeMismatch {
                            parameter: parameter.name.name.to_string().into(),
                            expected,
                            actual,
                            span: argument.span,
                        });
                    }
                    parameter_scope.push((parameter.name.name.as_ref(), value));
                }
                render_segments(&fragment.body, fragments, data, &parameter_scope, output)?;
            }
        }
    }
    Ok(())
}

fn resolve_path<'a, D: DataSource>(
    data: &'a D,
    scope: &[(&str, D::Value<'a>)],
    path: &SubstitutionPath<'_>,
) -> Result<D::Value<'a>, RenderError> {
    let names = path
        .segments
        .iter()
        .map(|segment| segment.name.as_ref())
        .collect::<Vec<_>>();
    let (mut value, remaining) =
        if let Some((_, value)) = scope.iter().find(|(name, _)| *name == names[0]) {
            (value.clone(), &names[1..])
        } else {
            (
                data.root().map_err(|source| RenderError::Data {
                    span: path.span,
                    source,
                })?,
                names.as_slice(),
            )
        };

    for segment in remaining {
        value = value
            .field(segment)
            .map_err(|source| RenderError::Data {
                span: path.span,
                source,
            })?
            .ok_or_else(|| RenderError::MissingValue {
                path: names.join(".").into(),
                span: path.span,
            })?;
    }

    Ok(value)
}

#[derive(Debug, Clone, PartialEq)]
pub enum RenderError {
    Parse(ParseError),
    MissingValue {
        path: JoiString,
        span: SourceSpan,
    },
    Data {
        span: SourceSpan,
        source: DataError,
    },
    ArgumentTypeMismatch {
        parameter: JoiString,
        expected: ValueKind,
        actual: ValueKind,
        span: SourceSpan,
    },
}

impl fmt::Display for RenderError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Parse(error) => write!(formatter, "invalid template: {error:?}"),
            Self::MissingValue { path, .. } => write!(formatter, "missing template value `{path}`"),
            Self::Data { source, .. } => write!(formatter, "template data error: {source:?}"),
            Self::ArgumentTypeMismatch {
                parameter,
                expected,
                actual,
                ..
            } => write!(
                formatter,
                "fragment parameter `{parameter}` expected {expected:?}, got {actual:?}"
            ),
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
                path: "user.name".into(),
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

    #[test]
    fn renders_fragments_declared_after_use_with_reordered_arguments() {
        let data = NativeDataSource::new(NativeValue::struct_(BTreeMap::from([
            ("name".to_owned(), NativeValue::string("title")),
            ("type_name".to_owned(), NativeValue::string("String")),
        ])));
        let template = "{@render field(type_name = type_name, name = name)}\n\
            {@fragment field(name: string, type_name: string)}pub {name}: {type_name},{@end}";

        assert_eq!(
            render(template, &data),
            Ok("pub title: String,\n".to_owned())
        );
    }

    #[test]
    fn renders_nested_fragments_with_parameter_shadowing_and_root_fallback() {
        let data = NativeDataSource::new(NativeValue::struct_(BTreeMap::from([
            ("name".to_owned(), NativeValue::string("root")),
            (
                "model".to_owned(),
                NativeValue::struct_(BTreeMap::from([(
                    "name".to_owned(),
                    NativeValue::string("Ticket"),
                )])),
            ),
            ("suffix".to_owned(), NativeValue::string("Dto")),
        ])));
        let template = "{@fragment outer(name: struct)}\
            {@render inner(value = name.name)}{@end}\
            {@fragment inner(value: string)}{value}{suffix}{@end}\
            {@render outer(name = model)}";

        assert_eq!(render(template, &data), Ok("TicketDto".to_owned()));
    }

    #[test]
    fn checks_all_parameter_kinds_when_forwarded() {
        let data = NativeDataSource::new(NativeValue::struct_(BTreeMap::from([
            ("s".to_owned(), NativeValue::string("ok")),
            ("b".to_owned(), NativeValue::boolean(true)),
            ("i".to_owned(), NativeValue::integer(1)),
            ("f".to_owned(), NativeValue::float(1.0)),
            ("o".to_owned(), NativeValue::struct_(BTreeMap::new())),
            ("l".to_owned(), NativeValue::list(Vec::new())),
        ])));
        let template = "{@fragment kinds(s: string, b: boolean, i: integer, f: float, o: struct, l: list)}{s}{@end}\
            {@render kinds(l = l, o = o, f = f, i = i, b = b, s = s)}";

        assert_eq!(render(template, &data), Ok("ok".to_owned()));
    }

    #[test]
    fn reports_fragment_argument_type_mismatches() {
        let data = NativeDataSource::new(NativeValue::struct_(BTreeMap::from([(
            "count".to_owned(),
            NativeValue::integer(2),
        )])));
        let template = "{@fragment item(value: string)}{value}{@end}{@render item(value = count)}";
        let error = render(template, &data).unwrap_err();

        assert!(matches!(
            error,
            RenderError::ArgumentTypeMismatch {
                parameter,
                expected: ValueKind::Primitive(PrimitiveType::String),
                actual: ValueKind::Primitive(PrimitiveType::Integer),
                ..
            } if parameter == "value"
        ));
    }
}
