use std::path::Path;
use std::process::Command;

use gix::bstr::ByteSlice;
use joi_error::{JoiResult, report};
use time::{OffsetDateTime, UtcOffset, format_description::well_known::Rfc3339};

/// Commit information returned independently of a particular Git implementation.
pub struct GitCommit {
    pub id: String,
    pub parent_ids: Vec<String>,
    pub message: String,
    pub author: String,
    pub authored_at: String,
}

/// Complete immutable data needed to review one commit.
pub struct GitCommitDetails {
    pub commit: GitCommit,
    pub files_changed: usize,
    pub lines_added: usize,
    pub lines_deleted: usize,
    pub patch: String,
}

/// Reads commit ancestry from a Git repository implementation.
pub trait GitHistory: Send + Sync {
    fn history(
        &self,
        git_directory: &Path,
        branch: &str,
        offset: usize,
        limit: usize,
    ) -> JoiResult<Vec<GitCommit>>;

    fn commit_details(&self, git_directory: &Path, commit_id: &str) -> JoiResult<GitCommitDetails>;
}

/// Git history reader backed by gitoxide.
pub struct GixGitHistory;

impl GitHistory for GixGitHistory {
    fn history(
        &self,
        git_directory: &Path,
        branch: &str,
        offset: usize,
        limit: usize,
    ) -> JoiResult<Vec<GitCommit>> {
        let repository = gix::open(git_directory).map_err(report)?;
        let tip = repository
            .find_reference(branch)
            .map_err(report)?
            .peel_to_commit()
            .map_err(report)?;
        let walk = repository.rev_walk([tip.id]).all().map_err(report)?;
        walk.skip(offset)
            .take(limit)
            .map(|entry| {
                let entry = entry.map_err(report)?;
                let commit = entry.object().map_err(report)?;
                let author = commit.author().map_err(report)?;
                let author_time = author.time().map_err(report)?;
                let offset = UtcOffset::from_whole_seconds(author_time.offset).map_err(report)?;
                let authored_at = OffsetDateTime::from_unix_timestamp(author_time.seconds)
                    .map_err(report)?
                    .to_offset(offset)
                    .format(&Rfc3339)
                    .map_err(report)?;
                Ok(GitCommit {
                    id: entry.id.to_string(),
                    parent_ids: entry.parent_ids().map(|id| id.to_string()).collect(),
                    message: commit
                        .message_raw()
                        .map_err(report)?
                        .to_str_lossy()
                        .into_owned(),
                    author: author.name.to_str_lossy().into_owned(),
                    authored_at,
                })
            })
            .collect()
    }

    fn commit_details(&self, git_directory: &Path, commit_id: &str) -> JoiResult<GitCommitDetails> {
        let repository = gix::open(git_directory).map_err(report)?;
        let id = gix::ObjectId::from_hex(commit_id.as_bytes()).map_err(report)?;
        let commit = repository.find_object(id).map_err(report)?.into_commit();
        let author = commit.author().map_err(report)?;
        let author_time = author.time().map_err(report)?;
        let offset = UtcOffset::from_whole_seconds(author_time.offset).map_err(report)?;
        let authored_at = OffsetDateTime::from_unix_timestamp(author_time.seconds)
            .map_err(report)?
            .to_offset(offset)
            .format(&Rfc3339)
            .map_err(report)?;
        let metadata = GitCommit {
            id: commit.id.to_string(),
            parent_ids: commit.parent_ids().map(|id| id.to_string()).collect(),
            message: commit
                .message_raw()
                .map_err(report)?
                .to_str_lossy()
                .into_owned(),
            author: author.name.to_str_lossy().into_owned(),
            authored_at,
        };

        // gix resolves and validates the object. Git's porcelain formatter is used here because
        // it produces the standard patch format consumed directly by the UI diff renderer.
        let git: std::ffi::OsString = std::env::var_os("GIT_EXECUTABLE")
            .or_else(|| {
                Path::new("/usr/bin/git")
                    .is_file()
                    .then(|| "/usr/bin/git".into())
            })
            .unwrap_or_else(|| "git".into());
        let mut command = Command::new(git);
        command.arg("--git-dir").arg(git_directory);
        if let Some(parent) = metadata.parent_ids.first() {
            command.args(["diff", "--patch", "--no-ext-diff", parent, commit_id]);
        } else {
            command.args([
                "diff-tree",
                "--root",
                "--no-commit-id",
                "--patch",
                "--no-ext-diff",
                commit_id,
            ]);
        }
        let output = command.output().map_err(report)?;
        if !output.status.success() {
            return Err(joi_error::joi_error!(
                "failed to create commit patch: {}",
                String::from_utf8_lossy(&output.stderr).trim()
            ));
        }
        let raw_patch = String::from_utf8_lossy(&output.stdout);
        let patch = text_only_patch(&raw_patch);
        let (files_changed, lines_added, lines_deleted) = patch_summary(&patch);
        Ok(GitCommitDetails {
            commit: metadata,
            files_changed,
            lines_added,
            lines_deleted,
            patch,
        })
    }
}

fn text_only_patch(patch: &str) -> String {
    patch
        .split("diff --git ")
        .skip(1)
        .filter(|section| {
            !section.contains("Binary files ") && !section.contains("GIT binary patch")
        })
        .map(|section| format!("diff --git {section}"))
        .collect()
}

fn patch_summary(patch: &str) -> (usize, usize, usize) {
    let mut files = 0;
    let mut added = 0;
    let mut deleted = 0;
    for line in patch.lines() {
        if line.starts_with("diff --git ") {
            files += 1;
        } else if line.starts_with('+') && !line.starts_with("+++") {
            added += 1;
        } else if line.starts_with('-') && !line.starts_with("---") {
            deleted += 1;
        }
    }
    (files, added, deleted)
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::{GitHistory, GixGitHistory, patch_summary, text_only_patch};

    #[test]
    fn reads_history_from_the_current_checkout() {
        let git_directory = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../.git");

        let commits = GixGitHistory.history(&git_directory, "HEAD", 0, 2).unwrap();

        assert_eq!(commits.len(), 2);
        assert!(commits.iter().all(|commit| commit.id.len() == 40));
        assert!(commits.iter().all(|commit| !commit.message.is_empty()));
        assert!(commits.iter().all(|commit| !commit.author.is_empty()));
        assert!(
            commits
                .iter()
                .all(|commit| commit.authored_at.contains('T'))
        );

        let details = GixGitHistory
            .commit_details(&git_directory, &commits[0].id)
            .unwrap();
        assert_eq!(details.commit.id, commits[0].id);
        assert_eq!(
            details.files_changed,
            details
                .patch
                .lines()
                .filter(|line| line.starts_with("diff --git "))
                .count()
        );
    }

    #[test]
    fn excludes_binary_files_and_summarizes_text_patch() {
        let patch = "diff --git a/a.txt b/a.txt\n--- a/a.txt\n+++ b/a.txt\n@@ -1 +1,2 @@\n-old\n+new\n+more\ndiff --git a/image.png b/image.png\nBinary files a/image.png and b/image.png differ\n";
        let text = text_only_patch(patch);

        assert!(text.contains("a/a.txt"));
        assert!(!text.contains("image.png"));
        assert_eq!(patch_summary(&text), (1, 2, 1));
    }
}
