use std::cell::Cell;

use joi_architecture::{
    ArchitectureComponent, ArchitectureContext, ArchitectureError, ArchitectureGraph,
};
use serde_json::{json, to_value};

struct Node<'a> {
    id: &'static str,
    target: Cell<Option<&'a Node<'a>>>,
    detail_calls: Cell<u32>,
}

impl Node<'_> {
    fn new(id: &'static str) -> Self {
        Self {
            id,
            target: Cell::new(None),
            detail_calls: Cell::new(0),
        }
    }
}

impl ArchitectureComponent for Node<'_> {
    fn describe<'a>(
        &'a self,
        context: &mut ArchitectureContext<'_, 'a>,
    ) -> Result<(), ArchitectureError> {
        context.component(self.id, self.id, "Example component", |details| {
            self.detail_calls.set(self.detail_calls.get() + 1);
            if let Some(target) = self.target.get() {
                details.config("enabled", true);
                details.metric("count", 2u64);
                details.relate("uses", target)?;
            }
            Ok(())
        })
    }
}

#[test]
fn collects_shared_components_in_stable_json_order() {
    let [first, second, shared] = [Node::new("a"), Node::new("b"), Node::new("c")];
    first.target.set(Some(&shared));
    second.target.set(Some(&shared));

    let graph =
        ArchitectureGraph::collect([&second as &dyn ArchitectureComponent, &first, &shared])
            .unwrap();
    assert_eq!(shared.detail_calls.get(), 1);
    assert_eq!(
        to_value(graph).unwrap(),
        json!({
            "components": [
                {
                    "id": "a", "label": "a", "description": "Example component",
                    "config": {"enabled": true}, "metrics": {"count": 2},
                    "relationships": [{"kind": "uses", "target_id": "c"}]
                },
                {
                    "id": "b", "label": "b", "description": "Example component",
                    "config": {"enabled": true}, "metrics": {"count": 2},
                    "relationships": [{"kind": "uses", "target_id": "c"}]
                },
                {"id": "c", "label": "c", "description": "Example component"}
            ]
        })
    );
}

#[test]
fn records_both_directions_of_a_cycle() {
    let [first, second] = [Node::new("a"), Node::new("b")];
    first.target.set(Some(&second));
    second.target.set(Some(&first));

    let graph = ArchitectureGraph::collect([&first as &dyn ArchitectureComponent]).unwrap();

    assert_eq!(graph.components.len(), 2);
    assert_eq!(
        graph.components[0].relationships.first().unwrap().target_id,
        "b"
    );
    assert_eq!(
        graph.components[1].relationships.first().unwrap().target_id,
        "a"
    );
    assert_eq!(first.detail_calls.get(), 1);
    assert_eq!(second.detail_calls.get(), 1);
}

#[test]
fn rejects_distinct_instances_with_the_same_id() {
    let first = Node::new("same");
    let second = Node::new("same");

    assert_eq!(
        ArchitectureGraph::collect([&first as &dyn ArchitectureComponent, &second]).unwrap_err(),
        ArchitectureError::DuplicateId("same".into())
    );
}

#[test]
fn rejects_blank_ids() {
    let node = Node::new(" ");

    assert_eq!(
        ArchitectureGraph::collect([&node as &dyn ArchitectureComponent]).unwrap_err(),
        ArchitectureError::BlankField("ID")
    );
}
