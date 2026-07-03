use std::{env, error::Error, fs, path::Path};

use joi_api_generator::{documentation::ApiDocumentation, parse, source_file::SourceFile};
use tiny_http::{Header, Method, Response, Server, StatusCode};

fn main() -> Result<(), Box<dyn Error + Send + Sync>> {
    let source_path = env::args()
        .nth(1)
        .unwrap_or_else(|| "examples/ticket.joi-api".to_owned());
    let address = env::args()
        .nth(2)
        .unwrap_or_else(|| "127.0.0.1:8787".to_owned());
    let server = Server::http(&address)?;

    eprintln!("Serving {source_path} at http://{address}/api.json");
    for request in server.incoming_requests() {
        let response = match (request.method(), request.url()) {
            (&Method::Get, "/api.json") => api_response(Path::new(&source_path)),
            _ => text_response(StatusCode(404), "Not found"),
        };
        if let Err(error) = request.respond(response) {
            eprintln!("Failed to send response: {error}");
        }
    }

    Ok(())
}

fn api_response(path: &Path) -> Response<std::io::Cursor<Vec<u8>>> {
    match documentation_json(path) {
        Ok(json) => response(StatusCode(200), "application/json; charset=utf-8", json),
        Err(message) => response(
            StatusCode(422),
            "application/json; charset=utf-8",
            serde_json::json!({ "error": message }).to_string(),
        ),
    }
}

fn documentation_json(path: &Path) -> Result<String, String> {
    let source = fs::read_to_string(path)
        .map_err(|error| format!("failed to read {}: {error}", path.display()))?;
    let source_file = SourceFile::new(path, source);
    let parsed = parse(&source_file);
    if !parsed.diagnostics.is_empty() {
        let messages = parsed
            .diagnostics
            .iter()
            .map(|diagnostic| {
                format!(
                    "{} at bytes {}..{}: {}",
                    diagnostic.code,
                    diagnostic.primary.span.start,
                    diagnostic.primary.span.end,
                    diagnostic.summary
                )
            })
            .collect::<Vec<_>>()
            .join("; ");
        return Err(messages);
    }

    let document = parsed
        .document
        .as_ref()
        .ok_or_else(|| "parser produced no document".to_owned())?;
    serde_json::to_string_pretty(&ApiDocumentation::from_document(document))
        .map_err(|error| format!("failed to serialize API documentation: {error}"))
}

fn text_response(status: StatusCode, body: &str) -> Response<std::io::Cursor<Vec<u8>>> {
    response(status, "text/plain; charset=utf-8", body.to_owned())
}

fn response(
    status: StatusCode,
    content_type: &str,
    body: String,
) -> Response<std::io::Cursor<Vec<u8>>> {
    Response::from_string(body)
        .with_status_code(status)
        .with_header(Header::from_bytes("Content-Type", content_type).unwrap())
        .with_header(Header::from_bytes("Cache-Control", "no-store").unwrap())
}

#[cfg(test)]
mod tests {
    use std::{fs, time::SystemTime};

    use super::documentation_json;

    #[test]
    fn documentation_json_reports_parser_diagnostics() {
        let path = std::env::temp_dir().join(format!(
            "joi-api-invalid-{:?}.joi-api",
            SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::write(&path, "model MissingModule {}").unwrap();

        let error = documentation_json(&path).unwrap_err();
        fs::remove_file(path).unwrap();

        assert!(error.contains("JAPI-P002"));
        assert!(error.contains("missing module declaration"));
    }

    #[test]
    fn documentation_json_serializes_a_valid_api() {
        let path = std::env::temp_dir().join(format!(
            "joi-api-valid-{:?}.joi-api",
            SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::write(&path, "module ticket; model Ticket { id: id<Ticket>; }").unwrap();

        let json = documentation_json(&path).unwrap();
        fs::remove_file(path).unwrap();
        let value: serde_json::Value = serde_json::from_str(&json).unwrap();

        assert_eq!(value["schemaVersion"], 1);
        assert_eq!(value["module"], "ticket");
        assert_eq!(value["models"][0]["name"], "Ticket");
    }
}
