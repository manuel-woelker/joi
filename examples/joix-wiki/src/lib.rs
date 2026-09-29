//! Wiki pages with server-owned attribution and rich-text content.
use joi_plugin::{Plugin, plugin};
use joi_server::{
    command_registry::CommandProvider, data_store::TableDescriptionProvider,
    mutation_contributor::MutationContributor,
};

mod draft_commands;
mod drafts;
mod page_attribution;
mod wikipages;

pub use wikipages::WikiPageTableDescriptionProvider;

/// Registers the wiki schema and automatic creator/author attribution.
pub fn wiki_plugin() -> Plugin {
    plugin("wiki", "Wiki pages", |context| {
        context.register_extension::<dyn TableDescriptionProvider>(
            "wikipages-table",
            "Defines rich-text wiki pages",
            Box::new(WikiPageTableDescriptionProvider),
        )?;
        context.register_extension::<dyn TableDescriptionProvider>(
            "wikipage-drafts-table",
            "Stores unpublished wiki page drafts",
            Box::new(drafts::WikiDraftTableDescriptionProvider),
        )?;
        context.register_extension::<dyn MutationContributor>(
            "wiki-attribution",
            "Preserves page creators and tracks distinct contributing authors",
            Box::new(page_attribution::PageAttribution),
        )?;
        context.register_extension::<dyn CommandProvider>(
            "wiki-draft-commands",
            "Opens and publishes wiki drafts",
            Box::new(draft_commands::WikiDraftCommandProvider),
        )
    })
}

#[cfg(test)]
mod tests;
