# Notes

## Releases

- Release with the **Version Bump** workflow (Actions -> Version Bump -> patch/minor/major). It
  bumps `package.json`, tags, and calls the Release workflow. Don't hand-tag: the Release
  workflow only runs by hand or from Version Bump (a tag push doesn't start it), and a tag cut
  while `package.json` has an older version makes `src/update.ts` show an update notice forever
  (this happened with v1.3.1; fixed by shipping 1.3.2).
