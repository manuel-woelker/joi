use joi_error::{JoiResult, joi_error};
use joi_plugin::{PluginRegistryBuilder, plugin};

trait Label: Send + Sync {
    fn label(&self) -> &'static str;
}

struct FixedLabel(&'static str);

impl Label for FixedLabel {
    fn label(&self) -> &'static str {
        self.0
    }
}

#[test]
fn registers_and_invokes_typed_extensions_in_order() {
    let mut builder = PluginRegistryBuilder::new();
    builder
        .register(plugin("labels", "Label providers", |context| {
            context.register_extension_point::<dyn Label>()?;
            context.register_extension::<dyn Label>(Box::new(FixedLabel("first")))?;
            context.register_extension::<dyn Label>(Box::new(FixedLabel("second")))?;
            Ok(())
        }))
        .unwrap();
    let registry = builder.build();

    let labels: Vec<_> = registry
        .extensions::<dyn Label>()
        .unwrap()
        .map(Label::label)
        .collect();

    assert_eq!(labels, ["first", "second"]);
}

#[test]
fn later_plugins_can_extend_existing_points() {
    let mut builder = PluginRegistryBuilder::new();
    builder
        .register(plugin("point", "Defines labels", |context| {
            context.register_extension_point::<dyn Label>()
        }))
        .unwrap();
    builder
        .register(plugin("implementation", "Provides labels", |context| {
            context.register_extension::<dyn Label>(Box::new(FixedLabel("later")))
        }))
        .unwrap();
    let registry = builder.build();

    let labels: Vec<_> = registry
        .extensions::<dyn Label>()
        .unwrap()
        .map(Label::label)
        .collect();
    assert_eq!(labels, ["later"]);
}

#[test]
fn cloned_registries_share_registered_extensions() {
    let mut builder = PluginRegistryBuilder::new();
    builder
        .register(plugin("shared", "Shared labels", |context| {
            context.register_extension_point::<dyn Label>()?;
            context.register_extension::<dyn Label>(Box::new(FixedLabel("visible")))
        }))
        .unwrap();
    let registry = builder.build();
    let cloned = registry.clone();

    assert_eq!(
        cloned
            .extensions::<dyn Label>()
            .unwrap()
            .next()
            .unwrap()
            .label(),
        "visible"
    );
}

#[test]
fn rejects_duplicate_plugin_names() {
    let mut builder = PluginRegistryBuilder::new();
    builder
        .register(plugin("same", "First plugin", |_| Ok(())))
        .unwrap();

    let error = builder
        .register(plugin("same", "Duplicate plugin", |_| Ok(())))
        .unwrap_err();

    assert_eq!(error.to_string(), "plugin `same` is already registered");
}

#[test]
fn rejects_duplicate_extension_points() {
    let mut builder = PluginRegistryBuilder::new();
    builder
        .register(plugin("first", "First point", |context| {
            context.register_extension_point::<dyn Label>()
        }))
        .unwrap();

    let error = builder
        .register(plugin("second", "Second point", |context| {
            context.register_extension_point::<dyn Label>()
        }))
        .unwrap_err();

    assert!(error.to_string().contains("is already registered"));
}

#[test]
fn rejects_extensions_for_unknown_points() {
    let mut builder = PluginRegistryBuilder::new();

    let error = builder
        .register(plugin("orphan", "Orphan extension", |context| {
            context.register_extension::<dyn Label>(Box::new(FixedLabel("orphan")))
        }))
        .unwrap_err();

    assert!(error.to_string().contains("is not registered"));
}

#[test]
fn failed_plugins_are_rolled_back_and_can_be_retried() {
    let mut builder = PluginRegistryBuilder::new();
    let error = builder
        .register(plugin("retryable", "Failed attempt", |context| {
            context.register_extension_point::<dyn Label>()?;
            context.register_extension::<dyn Label>(Box::new(FixedLabel("discarded")))?;
            Err(joi_error!("registration failed"))
        }))
        .unwrap_err();
    assert_eq!(error.to_string(), "registration failed");

    builder
        .register(plugin("retryable", "Committed attempt", |context| {
            context.register_extension_point::<dyn Label>()?;
            context.register_extension::<dyn Label>(Box::new(FixedLabel("committed")))
        }))
        .unwrap();
    let registry = builder.build();
    assert_eq!(
        registry
            .extensions::<dyn Label>()
            .unwrap()
            .next()
            .unwrap()
            .label(),
        "committed"
    );
}

#[test]
fn registering_the_same_concrete_type_for_distinct_traits_stays_typed() {
    trait AlternateLabel: Send + Sync {
        fn alternate(&self) -> &'static str;
    }

    impl AlternateLabel for FixedLabel {
        fn alternate(&self) -> &'static str {
            self.0
        }
    }

    let mut builder = PluginRegistryBuilder::new();
    builder
        .register(plugin("both", "Multiple traits", |context| {
            context.register_extension_point::<dyn Label>()?;
            context.register_extension_point::<dyn AlternateLabel>()?;
            context.register_extension::<dyn Label>(Box::new(FixedLabel("label")))?;
            context.register_extension::<dyn AlternateLabel>(Box::new(FixedLabel("alternate")))
        }))
        .unwrap();
    let registry = builder.build();

    assert_eq!(
        registry
            .extensions::<dyn AlternateLabel>()
            .unwrap()
            .next()
            .unwrap()
            .alternate(),
        "alternate"
    );
}

#[test]
fn exposes_committed_plugin_metadata_in_registration_order() {
    let mut builder = PluginRegistryBuilder::new();
    builder
        .register(plugin("infra", "Infrastructure services", |_| Ok(())))
        .unwrap();
    builder
        .register(plugin("tickets", "Ticket management", |_| Ok(())))
        .unwrap();
    let registry = builder.build();

    assert_eq!(
        registry
            .plugins()
            .map(|plugin| (plugin.name.as_str(), plugin.description.as_str()))
            .collect::<Vec<_>>(),
        [
            ("infra", "Infrastructure services"),
            ("tickets", "Ticket management")
        ]
    );
    assert_eq!(
        registry
            .clone()
            .plugins()
            .map(|plugin| (plugin.name.as_str(), plugin.description.as_str()))
            .collect::<Vec<_>>(),
        [
            ("infra", "Infrastructure services"),
            ("tickets", "Ticket management")
        ]
    );
}

#[allow(dead_code)]
fn callback_errors_use_joi_result() -> JoiResult<()> {
    Ok(())
}
