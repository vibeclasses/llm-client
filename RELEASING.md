# Releasing

This document describes the process for releasing new versions of the `llm-client`.

## Automated Release Process

The release process is automated via GitHub Actions. A new version is automatically published to both the npm registry and GitHub Packages when a commit is pushed to the `main` branch.

### Version Bumping

The version number is automatically bumped based on the commit message. The following conventions are used:

*   **`patch`:** If the commit message contains `fix` or `bug`.
*   **`minor`:** For any other commit message.
*   **`major`:** If the commit message contains `release`.

To skip the version bump, include `[skip version]` in the commit message.

### Publishing

Once the version is bumped, the package is published to both the npm registry and GitHub Packages. A new GitHub release is also created with the new version number.

## Manual Release Process

To manually trigger a release, you can push a commit to the `main` branch with a commit message that follows the version bumping conventions described above.