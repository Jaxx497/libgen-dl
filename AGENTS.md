# Notes

## Releases

- **v1.3.1 was released by hand-tagging `e30be8d`, where `package.json` still said `1.3.0`.** Its
  binaries and APK therefore report 1.3.0, and `src/update.ts` (compares the latest release tag
  with the baked-in version) shows them an "update available: 1.3.1" notice forever. `master` is
  fixed (`6c34d89` set 1.3.1). On the next release, run **Version Bump** (patch -> 1.3.2) so the
  tag and `package.json` agree; that clears the notice for anyone who upgrades.
- Release the normal way: Version Bump workflow, not a hand-made tag. The Release workflow only
  runs by hand or from Version Bump; pushing a tag does not start it.
