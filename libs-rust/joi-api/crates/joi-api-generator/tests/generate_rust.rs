use std::{fs, process::Command, time::SystemTime};

use joi_api_generator::{generate_rust, parse, source_file::SourceFile};

const TICKET_API: &str = include_str!("../../../examples/ticket.joi-api");
const EXPECTED_RUST: &str = include_str!("fixtures/ticket.rs");

#[test]
fn generates_ticket_fixture_deterministically() {
    let source = SourceFile::new("examples/ticket.joi-api", TICKET_API);
    let document = parse(&source).document.unwrap();

    let first = generate_rust(&document, &source);
    let second = generate_rust(&document, &source);

    assert_eq!(first.diagnostics, []);
    assert_eq!(first.source.as_deref(), Some(EXPECTED_RUST));
    assert_eq!(first, second);
}

#[test]
fn generated_ticket_fixture_compiles() {
    let directory = temporary_directory("compile");
    fs::create_dir(&directory).unwrap();
    let source_path = directory.join("ticket.rs");
    let output_path = directory.join("libticket.rlib");
    fs::write(&source_path, EXPECTED_RUST).unwrap();

    let output = Command::new("rustc")
        .args(["--edition=2024", "--crate-type=lib"])
        .arg(&source_path)
        .arg("-o")
        .arg(&output_path)
        .output()
        .unwrap();
    fs::remove_dir_all(directory).unwrap();

    assert!(
        output.status.success(),
        "rustc failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
}

#[test]
fn generator_binary_writes_stdout_and_output_file() {
    let directory = temporary_directory("cli");
    fs::create_dir(&directory).unwrap();
    let input = directory.join("ticket.joi-api");
    let generated = directory.join("ticket.rs");
    fs::write(&input, TICKET_API).unwrap();
    let binary = env!("CARGO_BIN_EXE_joi-api-generate-rust");

    let stdout = Command::new(binary).arg(&input).output().unwrap();
    assert!(stdout.status.success());
    assert_eq!(String::from_utf8(stdout.stdout).unwrap(), EXPECTED_RUST);

    let file_output = Command::new(binary)
        .arg(&input)
        .arg("--output")
        .arg(&generated)
        .output()
        .unwrap();
    assert!(file_output.status.success());
    assert_eq!(fs::read_to_string(&generated).unwrap(), EXPECTED_RUST);
    fs::remove_dir_all(directory).unwrap();
}

fn temporary_directory(label: &str) -> std::path::PathBuf {
    std::env::temp_dir().join(format!(
        "joi-api-{label}-{}",
        SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ))
}
