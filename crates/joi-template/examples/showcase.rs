use std::collections::BTreeMap;

use joi_template::model::{DataType, Field, ListType, PrimitiveType, StructType};
use joi_template::parse_template;
use joi_template::runtime::{NativeDataSource, NativeValue};
use joi_template::template::Template;

fn main() {
    match joi_template::showcase_example_output() {
        Ok(output) => println!("{output}"),
        Err(error) => {
            eprintln!("showcase failed: {error:?}");
            std::process::exit(1);
        }
    }
}

#[allow(dead_code)]
fn schema() -> DataType {
    DataType::Struct(StructType::new(vec![
        Field::new(
            "user",
            DataType::Struct(StructType::new(vec![
                Field::new("name", DataType::Primitive(PrimitiveType::String)),
                Field::new("is_admin", DataType::Primitive(PrimitiveType::Boolean)),
            ])),
        ),
        Field::new(
            "company",
            DataType::Struct(StructType::new(vec![Field::new(
                "name",
                DataType::Primitive(PrimitiveType::String),
            )])),
        ),
        Field::new(
            "tags",
            DataType::List(ListType::new(DataType::Primitive(PrimitiveType::String))),
        ),
    ]))
}

#[allow(dead_code)]
fn data_source() -> NativeDataSource {
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

#[allow(dead_code)]
fn template() -> Result<Template<'static>, joi_template::ParseError> {
    parse_template("Hello {user.name} from {company.name}!")
}
