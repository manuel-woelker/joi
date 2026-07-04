use joi_api_generator::{
    ast::{Declaration, OperationKind, TypeExpressionKind},
    parse,
    source_file::SourceFile,
};

const TICKET_API: &str = include_str!("../../../examples/ticket.joi-api");

#[test]
fn parses_ticket_example_with_exact_source_spans() {
    let source = SourceFile::new("examples/ticket.joi-api", TICKET_API);
    let output = parse(&source);

    assert_eq!(output.diagnostics, []);
    let document = output.document.expect("ticket example should parse");
    assert_eq!(document.module.name.text, "ticket");
    assert_eq!(
        source.span_text(document.module.span),
        Some("module ticket;")
    );
    assert_eq!(document.declarations.len(), 5);

    let Declaration::Model(ticket) = &document.declarations[0] else {
        panic!("first declaration should be Ticket");
    };
    assert_eq!(ticket.name.text, "Ticket");
    assert_eq!(ticket.fields.len(), 3);
    assert_eq!(
        source.span_text(ticket.fields[0].span),
        Some("id: id<Ticket>;")
    );

    let Declaration::Operation(create) = &document.declarations[1] else {
        panic!("second declaration should be create");
    };
    assert_eq!(create.kind.value, OperationKind::Command);
    assert_eq!(create.name.text, "create");
    assert_eq!(
        source.span_text(create.parameters[0].ty.span),
        Some("list<Ticket>")
    );

    let Declaration::Operation(get) = &document.declarations[2] else {
        panic!("third declaration should be get");
    };
    assert_eq!(get.kind.value, OperationKind::Query);
    assert_eq!(get.returns.as_ref().unwrap().fields.len(), 1);

    let Declaration::Operation(update) = &document.declarations[3] else {
        panic!("fourth declaration should be update");
    };
    let TypeExpressionKind::Generic { arguments, .. } = &update.parameters[0].ty.kind else {
        panic!("update parameter should be a generic list");
    };
    assert_eq!(arguments.len(), 1);

    assert_eq!(source.span_text(document.span), Some(TICKET_API));
}

#[test]
fn documentation_is_attached_with_spans_and_preserved_as_trivia() {
    let source = SourceFile::new("examples/ticket.joi-api", TICKET_API);
    let document = parse(&source).document.unwrap();
    let Declaration::Model(ticket) = &document.declarations[0] else {
        panic!("first declaration should be Ticket");
    };
    let documentation = ticket.documentation.as_ref().unwrap();

    assert_eq!(
        documentation.text,
        "A work item representing a bug, task, or issue."
    );
    assert_eq!(
        source.span_text(documentation.span),
        Some("/// A work item representing a bug, task, or issue.")
    );
    assert!(
        document.declarations[0]
            .leading_trivia()
            .iter()
            .any(|piece| {
                source
                    .span_text(piece.span)
                    .is_some_and(|text| text.contains("A work item"))
            })
    );
}
