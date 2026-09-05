#!/usr/bin/env bash

set -euo pipefail

readonly VERSION="0.7.0"
readonly SHA256="sha256:f610e78b5e79284a278776d1761ca623fba743bfc6941e14e2528d803516ad15"
readonly DOWNLOAD_URL="https://github.com/manuel-woelker/tool-tool/releases/download/v${VERSION}/tool-tool"
readonly REPOSITORY_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly TOOL_DIRECTORY="${REPOSITORY_ROOT}/.cache/tool-tool/${VERSION}"
readonly TOOL="${TOOL_DIRECTORY}/tool-tool"

verify_checksum() {
  local checksum

  if [[ "${SHA256}" != sha256:* ]]; then
    printf 'Unsupported checksum format: %s\n' "${SHA256}" >&2
    return 1
  fi

  checksum="${SHA256#sha256:}"
  printf '%s  %s\n' "${checksum}" "$1" | sha256sum --check --status
}

if [[ ! -f "${TOOL}" ]]; then
  mkdir -p -- "${TOOL_DIRECTORY}"
  temporary_file="$(mktemp "${TOOL_DIRECTORY}/.tool-tool.XXXXXX")"
  trap 'rm -f -- "${temporary_file}"' EXIT

  curl \
    --proto '=https' \
    --tlsv1.2 \
    --location \
    --fail \
    --silent \
    --show-error \
    --output "${temporary_file}" \
    "${DOWNLOAD_URL}"

  if ! verify_checksum "${temporary_file}"; then
    printf 'Checksum verification failed for tool-tool %s.\n' "${VERSION}" >&2
    exit 1
  fi

  chmod 0755 "${temporary_file}"
  mv -- "${temporary_file}" "${TOOL}"
  trap - EXIT
fi

if ! verify_checksum "${TOOL}"; then
  printf 'Cached tool-tool %s has an invalid checksum: %s\n' "${VERSION}" "${TOOL}" >&2
  exit 1
fi

exec "${TOOL}" "$@"
