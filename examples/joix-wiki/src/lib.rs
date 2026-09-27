//! Wiki pages with server-owned attribution and rich-text content.
use joi_plugin::{Plugin, plugin};
use joi_server::{data_store::TableDescriptionProvider, mutation_contributor::MutationContributor};

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
        context.register_extension::<dyn MutationContributor>(
            "wiki-attribution",
            "Preserves page creators and tracks distinct contributing authors",
            Box::new(page_attribution::PageAttribution),
        )
    })
}

#[cfg(test)]
mod tests;
