use std::{env, fs, path::PathBuf, process::ExitCode};

use joi_api_generator::{generate_rust, parse, source_file::SourceFile};

fn main() -> ExitCode {
    let command = match parse_args(env::args().skip(1)) {
        Ok(command) => command,
        Err(message) => {
            eprintln!("{message}");
            print_usage();
            return ExitCode::FAILURE;
        }
    };

    let source = match fs::read_to_string(&command.input) {
        Ok(source) => source,
        Err(error) => {
            eprintln!("failed to read {}: {error}", command.input.display());
            return ExitCode::FAILURE;
        }
    };
    let source_file = SourceFile::new(&command.input, source);
    let parsed = parse(&source_file);
    if !parsed.diagnostics.is_empty() {
        print_diagnostics(&parsed.diagnostics);
        return ExitCode::FAILURE;
    }
    let generated = generate_rust(parsed.document.as_ref().unwrap(), &source_file);
    if !generated.diagnostics.is_empty() {
        print_diagnostics(&generated.diagnostics);
        return ExitCode::FAILURE;
    }
    let source = generated.source.unwrap();

    if let Some(output) = command.output {
        if let Err(error) = fs::write(&output, source) {
            eprintln!("failed to write {}: {error}", output.display());
            return ExitCode::FAILURE;
        }
    } else {
        print!("{source}");
    }

    ExitCode::SUCCESS
}

#[derive(Debug, PartialEq, Eq)]
struct Command {
    input: PathBuf,
    output: Option<PathBuf>,
}

fn parse_args(args: impl Iterator<Item = String>) -> Result<Command, &'static str> {
    let arguments: Vec<_> = args.collect();
    match arguments.as_slice() {
        [input] => Ok(Command {
            input: input.into(),
            output: None,
        }),
        [input, flag, output] if flag == "--output" => Ok(Command {
            input: input.into(),
            output: Some(output.into()),
        }),
        [] => Err("missing JOI API input path"),
        _ => Err("expected <input> [--output <path>]"),
    }
}

fn print_diagnostics(diagnostics: &[joi_api_generator::diagnostic::Diagnostic]) {
    for diagnostic in diagnostics {
        eprintln!(
            "{}:{}..{}: {}: {}",
            diagnostic.source_path.display(),
            diagnostic.primary.span.start,
            diagnostic.primary.span.end,
            diagnostic.code,
            diagnostic.summary
        );
    }
}

fn print_usage() {
    eprintln!("Usage: joi-api-generate-rust <input> [--output <path>]");
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::{Command, parse_args};

    #[test]
    fn parses_stdout_and_file_commands() {
        assert_eq!(
            parse_args(["api.joi-api".to_owned()].into_iter()),
            Ok(Command {
                input: PathBuf::from("api.joi-api"),
                output: None,
            })
        );
        assert_eq!(
            parse_args(
                [
                    "api.joi-api".to_owned(),
                    "--output".to_owned(),
                    "api.rs".to_owned(),
                ]
                .into_iter()
            ),
            Ok(Command {
                input: PathBuf::from("api.joi-api"),
                output: Some(PathBuf::from("api.rs")),
            })
        );
    }
}
