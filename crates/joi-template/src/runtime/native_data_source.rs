use crate::runtime::{DataError, DataSource, NativeValue};

/// A native in-memory data source for template evaluation.
#[derive(Debug, Clone, PartialEq)]
pub struct NativeDataSource {
    root: NativeValue,
}

impl NativeDataSource {
    /// Creates a new native data source from a root value.
    #[must_use]
    pub fn new(root: NativeValue) -> Self {
        Self { root }
    }
}

impl DataSource for NativeDataSource {
    type Value<'a>
        = &'a NativeValue
    where
        Self: 'a;

    fn root(&self) -> Result<Self::Value<'_>, DataError> {
        Ok(&self.root)
    }
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use crate::model::PrimitiveType;
    use crate::runtime::{
        DataError, DataSource, NativeDataSource, NativeValue, ValueKind, ValueView,
    };

    #[test]
    fn returns_the_root_value_view() {
        let data_source = NativeDataSource::new(NativeValue::string("hello"));
        let root = data_source.root().unwrap();

        assert_eq!(root.kind(), ValueKind::Primitive(PrimitiveType::String));
        assert_eq!(root.as_str(), Ok("hello"));
    }

    #[test]
    fn reads_struct_fields() {
        let data_source = NativeDataSource::new(NativeValue::struct_(BTreeMap::from([(
            "user".to_owned(),
            NativeValue::string("Ada"),
        )])));
        let root = data_source.root().unwrap();
        let user = root.field("user").unwrap().unwrap();

        assert_eq!(user.as_str(), Ok("Ada"));
    }

    #[test]
    fn returns_none_for_missing_fields() {
        let data_source = NativeDataSource::new(NativeValue::struct_(BTreeMap::new()));
        let root = data_source.root().unwrap();

        assert_eq!(root.field("missing"), Ok(None));
    }

    #[test]
    fn reports_type_mismatches_for_primitive_reads() {
        let data_source = NativeDataSource::new(NativeValue::boolean(true));
        let root = data_source.root().unwrap();

        assert_eq!(
            root.as_str(),
            Err(DataError::TypeMismatch {
                expected: "string",
                actual: ValueKind::Primitive(PrimitiveType::Boolean),
            })
        );
    }

    #[test]
    fn reports_type_mismatches_for_field_lookup_on_non_structs() {
        let data_source = NativeDataSource::new(NativeValue::integer(7));
        let root = data_source.root().unwrap();

        assert_eq!(
            root.field("value"),
            Err(DataError::TypeMismatch {
                expected: "struct",
                actual: ValueKind::Primitive(PrimitiveType::Integer),
            })
        );
    }

    #[test]
    fn iterates_over_list_elements() {
        let data_source = NativeDataSource::new(NativeValue::list(vec![
            NativeValue::integer(1),
            NativeValue::integer(2),
        ]));
        let root = data_source.root().unwrap();
        let values: Vec<i64> = root
            .elements()
            .unwrap()
            .map(|value| value.unwrap().as_i64().unwrap())
            .collect();

        assert_eq!(values, vec![1, 2]);
    }
}
