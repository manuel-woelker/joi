use std::path::Path;

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

/// Reads commit ancestry from a Git repository implementation.
pub trait GitHistory: Send + Sync {
    fn history(
        &self,
        git_directory: &Path,
        branch: &str,
        offset: usize,
        limit: usize,
    ) -> JoiResult<Vec<GitCommit>>;
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
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::{GitHistory, GixGitHistory};

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
    }
}
