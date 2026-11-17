//! Grades domain model registration.

use joi_plugin::{Plugin, plugin};
use joi_server::domain_model::register_domain_model;

const MODEL_JSON: &str = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/generated/model.json"));

/// Contributes the compiled grades model to the server's model explorer.
pub fn grades_plugin() -> Plugin {
    plugin("grades", "Grades domain", |context| {
        register_domain_model(context, "grades", MODEL_JSON)
    })
}

#[cfg(test)]
mod tests {
    use joi_plugin::{PluginRegistryBuilder, plugin};
    use joi_server::{
        command_handler::CommandHandler, data_store::TableDescriptionProvider,
        domain_model::DomainModelProvider, generated::api::ModelInfoRequest,
        model_info_command::ModelInfoCommand,
    };

    use super::grades_plugin;

    #[test]
    fn embedded_grades_model_appears_in_model_info() {
        let mut builder = PluginRegistryBuilder::new();
        builder
            .register(plugin("base", "base", |context| {
                context
                    .register_extension_point::<dyn TableDescriptionProvider>("tables", "Tables")?;
                context.register_extension_point::<dyn DomainModelProvider>(
                    "domain-models",
                    "Domain models",
                )
            }))
            .unwrap();
        builder.register(grades_plugin()).unwrap();
        let response = ModelInfoCommand::new(builder.build())
            .execute(&Default::default(), ModelInfoRequest {})
            .unwrap();
        assert_eq!(response.domain_models.len(), 6);
        assert_eq!(response.domain_enums.len(), 1);
        let method = &response.domain_enums[0];
        assert_eq!(method.id, "grades.Assessment Method");
        assert_eq!(
            method
                .values
                .iter()
                .map(|value| value.name.as_str())
                .collect::<Vec<_>>(),
            ["verbal", "written"]
        );
        let assessment = response
            .domain_models
            .iter()
            .find(|model| model.id == "grades.Assessment")
            .unwrap();
        let kind = assessment
            .attributes
            .iter()
            .find(|attribute| attribute.name == "Method")
            .unwrap();
        assert_eq!(kind.data_type, "enum<Assessment Method>");
        assert!(
            assessment
                .attributes
                .iter()
                .all(|attribute| attribute.name != "Student" && attribute.name != "Grade")
        );
        let grade = response
            .domain_models
            .iter()
            .find(|model| model.id == "grades.Assessment Grade")
            .unwrap();
        assert_eq!(
            grade
                .attributes
                .iter()
                .map(|attribute| (attribute.name.as_str(), attribute.data_type.as_str()))
                .collect::<Vec<_>>(),
            [
                ("Assessment", "ref<Assessment>"),
                ("Student", "ref<Student>"),
                ("Grade", "number"),
            ]
        );
        let student = response
            .domain_models
            .iter()
            .find(|model| model.id == "grades.Student")
            .unwrap();
        assert_eq!(
            student.description,
            "A person enrolled in classes during a school year."
        );
        assert_eq!(student.attributes[1].name, "Date of Birth");
        assert_eq!(student.attributes[1].data_type, "date");
    }
}
