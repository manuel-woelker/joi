//! Canonical repository form and table metadata.
use joi_server::{
    generated::api::{ModelControl, ModelPresentation},
    model_metadata::field,
};

pub fn repository_presentation() -> ModelPresentation {
    ModelPresentation {
        route: Some(joi_server::model_metadata::entity_route("repository", "id")),
        label: "Repository".into(),
        plural_label: "Repositories".into(),
        label_template: "${name}".into(),
        icon: "git-pull-request".into(),
        fields: vec![
            field("id", "ID").ksuid(),
            field("key", "Key")
                .edit(ModelControl::Text)
                .column(true, Some(140))
                .required()
                .placeholder("joi"),
            field("name", "Name")
                .edit(ModelControl::Text)
                .column(true, None)
                .required()
                .placeholder("Joi"),
            field("path", "Path")
                .edit(ModelControl::Text)
                .column(true, None)
                .required()
                .placeholder("/path/to/repository"),
        ],
    }
}
