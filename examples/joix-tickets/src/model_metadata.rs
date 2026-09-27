//! Server-owned ticket and project presentation, defaults and validation.
use joi_server::{
    generated::api::{ModelControl, ModelPresentation},
    model_metadata::{field, timestamp},
};

pub fn ticket_presentation() -> ModelPresentation {
    ModelPresentation {
        label: "Ticket".into(),
        plural_label: "Tickets".into(),
        label_template: "${key}: ${title}".into(),
        icon: "ticket".into(),
        fields: vec![
            field("id", "ID").ksuid(),
            field("key", "Key").column(true, Some(120)),
            timestamp("creation_date", "Created"),
            timestamp("update_date", "Updated"),
            field("project_id", "Project")
                .edit(ModelControl::Lookup)
                .column(true, Some(140))
                .facet(),
            field("title", "Title")
                .edit(ModelControl::Text)
                .column(true, Some(260))
                .required(),
            field("status", "Status")
                .literal("open")
                .column(true, Some(120))
                .facet(),
            field("assignee", "Assignee")
                .edit(ModelControl::Lookup)
                .column(true, Some(160))
                .facet(),
            field("description", "Description")
                .edit(ModelControl::Html)
                .column(true, None),
        ],
    }
}

pub fn project_presentation() -> ModelPresentation {
    ModelPresentation {
        label: "Project".into(),
        plural_label: "Projects".into(),
        label_template: "${name}".into(),
        icon: "folder-kanban".into(),
        fields: vec![
            timestamp("creation_date", "Created"),
            timestamp("update_date", "Updated"),
            field("id", "ID").ksuid(),
            field("name", "Name")
                .edit(ModelControl::Text)
                .column(true, None)
                .required(),
            field("prefix", "Prefix")
                .edit(ModelControl::Text)
                .column(true, Some(120))
                .required()
                .placeholder("PROJECT")
                .matches(
                    "^[A-Z][A-Z0-9]*$",
                    "Use uppercase letters and numbers, starting with a letter.",
                ),
            field("description", "Description")
                .edit(ModelControl::Html)
                .column(true, None)
                .required(),
        ],
    }
}
