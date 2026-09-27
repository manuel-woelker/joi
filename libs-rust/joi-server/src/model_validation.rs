//! Compiles declared rules once at schema registration and checks final entity state before commit.
use crate::{
    data_store::{ColumnDataType, TableDescription},
    generated::api::{ModelControl, ModelValidationKind},
};
use joi_error::{JoiResult, joi_bail, joi_error, report};
use regex::Regex;
use serde_json::{Map, Value};
use std::collections::HashSet;

#[derive(Default)]
pub(crate) struct ModelValidator {
    fields: Vec<FieldRules>,
}
struct FieldRules {
    name: String,
    rules: Vec<Rule>,
    html: Option<Regex>,
}
enum Rule {
    Required(String),
    Regex(Regex, String),
}

impl ModelValidator {
    pub fn compile(table: &TableDescription) -> JoiResult<Self> {
        let Some(presentation) = &table.presentation else {
            return Ok(Self::default());
        };
        if presentation.label.trim().is_empty()
            || presentation.plural_label.trim().is_empty()
            || presentation.icon.trim().is_empty()
        {
            joi_bail!("invalid presentation for `{}`", table.name.0);
        }
        let mut remaining = presentation.label_template.as_str();
        while let Some((_, suffix)) = remaining.split_once("${") {
            let (name, rest) = suffix
                .split_once('}')
                .ok_or_else(|| joi_error!("invalid label template for `{}`", table.name.0))?;
            if !table.columns.iter().any(|column| column.name.0 == name) {
                joi_bail!("unknown label attribute `{name}` in `{}`", table.name.0);
            }
            remaining = rest;
        }
        let mut seen = HashSet::new();
        let mut fields = Vec::new();
        let html_tags = Regex::new("<[^>]*>").map_err(report)?;
        for field in &presentation.fields {
            let column = table
                .columns
                .iter()
                .find(|column| column.name.0 == field.attribute)
                .ok_or_else(|| {
                    joi_error!(
                        "unknown model field `{}` in `{}`",
                        field.attribute,
                        table.name.0
                    )
                })?;
            if !seen.insert(&field.attribute) {
                joi_bail!("duplicate model field `{}`", field.attribute);
            }
            if field.control == ModelControl::Lookup
                && !matches!(column.data_type, ColumnDataType::Reference { .. })
            {
                joi_bail!("lookup field `{}` must be a reference", field.attribute);
            }
            if (field.control == ModelControl::Integer)
                != matches!(column.data_type, ColumnDataType::Int)
            {
                joi_bail!("control type mismatch for `{}`", field.attribute);
            }
            let mut rules = Vec::new();
            for rule in &field.validation {
                rules.push(match rule.kind {
                    ModelValidationKind::Required => Rule::Required(rule.message.clone()),
                    ModelValidationKind::Regex => {
                        if matches!(column.data_type, ColumnDataType::Int) {
                            joi_bail!("regex requires a string attribute");
                        }
                        let pattern = rule
                            .pattern
                            .as_ref()
                            .ok_or_else(|| joi_error!("regex rule requires a pattern"))?;
                        Rule::Regex(Regex::new(pattern).map_err(report)?, rule.message.clone())
                    }
                });
            }
            if !rules.is_empty() {
                fields.push(FieldRules {
                    name: field.attribute.clone(),
                    rules,
                    html: if field.control == ModelControl::Html {
                        Some(html_tags.clone())
                    } else {
                        None
                    },
                });
            }
        }
        if seen.len() != table.columns.len() {
            joi_bail!(
                "presentation must describe every attribute in `{}`",
                table.name.0
            );
        }
        Ok(Self { fields })
    }

    pub fn validate(&self, table: &TableDescription, object: &Map<String, Value>) -> JoiResult<()> {
        for field in &self.fields {
            let value = object.get(&field.name);
            for rule in &field.rules {
                let (valid, message) = match rule {
                    Rule::Required(message) => {
                        let valid = match value {
                            None | Some(Value::Null) => false,
                            Some(Value::String(text)) => {
                                if let Some(tags) = &field.html {
                                    !tags
                                        .replace_all(text, "")
                                        .replace("&nbsp;", " ")
                                        .replace("&#160;", " ")
                                        .trim()
                                        .is_empty()
                                } else {
                                    !text.trim().is_empty()
                                }
                            }
                            _ => true,
                        };
                        (valid, message)
                    }
                    Rule::Regex(regex, message) => (
                        value.is_none_or(Value::is_null)
                            || value
                                .and_then(Value::as_str)
                                .is_some_and(|text| text.is_empty() || regex.is_match(text)),
                        message,
                    ),
                };
                if !valid {
                    joi_bail!("{}.{}: {}", table.name.0, field.name, message);
                }
            }
        }
        Ok(())
    }
}
