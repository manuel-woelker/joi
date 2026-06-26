use std::collections::BTreeMap;
use std::fmt::Write;

use crate::parser::{ParseError, parse_template};
use crate::runtime::{DataError, DataSource, NativeDataSource, NativeValue, ValueView};
use crate::schema::{DataType, Field, ListType, PrimitiveType, StructType};
use crate::template::Template;

/// Builds the schema used by the crate showcase example.
#[must_use]
pub fn showcase_schema() -> DataType {
    DataType::struct_(StructType::new(vec![
        Field::new(
            "user",
            DataType::struct_(StructType::new(vec![
                Field::new("name", DataType::primitive(PrimitiveType::String)),
                Field::new("is_admin", DataType::primitive(PrimitiveType::Boolean)),
            ])),
        ),
        Field::new(
            "company",
            DataType::struct_(StructType::new(vec![Field::new(
                "name",
                DataType::primitive(PrimitiveType::String),
            )])),
        ),
        Field::new(
            "tags",
            DataType::list(ListType::new(DataType::primitive(PrimitiveType::String))),
        ),
    ]))
}

/// Builds the runtime data used by the crate showcase example.
#[must_use]
pub fn showcase_data_source() -> NativeDataSource {
    NativeDataSource::new(NativeValue::struct_(BTreeMap::from([
        (
            "user".to_owned(),
            NativeValue::struct_(BTreeMap::from([
                ("name".to_owned(), NativeValue::string("Ada")),
                ("is_admin".to_owned(), NativeValue::boolean(true)),
            ])),
        ),
        (
            "company".to_owned(),
            NativeValue::struct_(BTreeMap::from([(
                "name".to_owned(),
                NativeValue::string("Analytical Engines Ltd."),
            )])),
        ),
        (
            "tags".to_owned(),
            NativeValue::list(vec![
                NativeValue::string("math"),
                NativeValue::string("logic"),
                NativeValue::string("systems"),
            ]),
        ),
    ])))
}

/// Parses the template used by the crate showcase example.
pub fn showcase_template() -> Result<Template<'static>, ParseError> {
    parse_template("Hello {user.name} from {company.name}!")
}

/// Produces a textual walkthrough of the current implemented feature set.
pub fn showcase_example_output() -> Result<String, ShowcaseError> {
    let schema = showcase_schema();
    let template = showcase_template()?;
    let data_source = showcase_data_source();
    let root = data_source.root()?;

    let user = root
        .field("user")?
        .expect("showcase data should contain user");
    let company = root
        .field("company")?
        .expect("showcase data should contain company");
    let tags = root
        .field("tags")?
        .expect("showcase data should contain tags");

    let user_name = user
        .field("name")?
        .expect("showcase data should contain user.name")
        .as_str()?;
    let company_name = company
        .field("name")?
        .expect("showcase data should contain company.name")
        .as_str()?;
    let tags: Vec<String> = tags
        .elements()?
        .map(|value| Ok::<_, DataError>(value?.as_str()?.to_owned()))
        .collect::<Result<_, _>>()?;

    let mut output = String::new();
    writeln!(&mut output, "# joi-template showcase").unwrap();
    writeln!(&mut output).unwrap();
    writeln!(&mut output, "Schema root: {schema:#?}").unwrap();
    writeln!(&mut output).unwrap();
    writeln!(&mut output, "Parsed template: {template:#?}").unwrap();
    writeln!(&mut output).unwrap();
    writeln!(&mut output, "Resolved runtime values:").unwrap();
    writeln!(&mut output, "- user.name = {user_name}").unwrap();
    writeln!(&mut output, "- company.name = {company_name}").unwrap();
    writeln!(&mut output, "- tags = {}", tags.join(", ")).unwrap();
    writeln!(&mut output).unwrap();
    writeln!(&mut output, "Current status:").unwrap();
    writeln!(
        &mut output,
        "- template parsing works for substitutions like {{user.name}}"
    )
    .unwrap();
    writeln!(
        &mut output,
        "- runtime data traversal works through the pluggable data access layer"
    )
    .unwrap();
    writeln!(
        &mut output,
        "- final rendering is still future work; the example stops short of producing rendered output"
    )
    .unwrap();

    Ok(output)
}

/// Errors produced while generating the showcase example output.
#[derive(Debug)]
pub enum ShowcaseError {
    Parse(ParseError),
    Data(DataError),
}

impl From<ParseError> for ShowcaseError {
    fn from(value: ParseError) -> Self {
        Self::Parse(value)
    }
}

impl From<DataError> for ShowcaseError {
    fn from(value: DataError) -> Self {
        Self::Data(value)
    }
}

#[cfg(test)]
mod tests {
    use super::{showcase_example_output, showcase_schema};
    use crate::schema::DataTypeKind;

    #[test]
    fn showcase_schema_uses_nested_structs_and_lists() {
        match showcase_schema().kind {
            DataTypeKind::Struct(root) => assert_eq!(root.fields.len(), 3),
            other => panic!("expected struct root, got {other:?}"),
        }
    }

    #[test]
    fn showcase_output_describes_current_capabilities() {
        let output = showcase_example_output().unwrap();

        assert!(output.contains("# joi-template showcase"));
        assert!(output.contains("Resolved runtime values:"));
        assert!(output.contains("- user.name = Ada"));
        assert!(output.contains("- company.name = Analytical Engines Ltd."));
        assert!(output.contains("- tags = math, logic, systems"));
        assert!(output.contains("final rendering is still future work"));
    }
}
