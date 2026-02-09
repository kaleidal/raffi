# Refactoring Notes

## Code Duplication: streamMetadata.ts

### Issue
The `streamMetadata.ts` module is currently duplicated between:
- `raffi-mobile/lib/streams/streamMetadata.ts`
- `raffi-desktop/src/lib/streams/streamMetadata.ts`

This duplication creates maintenance overhead and risk of drift over time.

### Recommendation
Consider one of the following approaches:

1. **Create a shared package**: Extract the common metadata parsing logic into a separate npm package (e.g., `@raffi/shared-utils` or `@raffi/stream-metadata`) that both mobile and desktop apps can depend on.

2. **Monorepo workspace structure**: Use a tool like npm workspaces, pnpm workspaces, or Turborepo to create a shared package within the monorepo:
   ```
   packages/
     shared/
       stream-metadata/
     mobile/
     desktop/
   ```

3. **Symlink or file generation**: Generate the shared code from a single source of truth during the build process.

### Trade-offs
- **Shared package**: Best for long-term maintainability but requires additional build infrastructure
- **Monorepo**: Good balance of code sharing and independent deployment, requires workspace tooling
- **Code generation**: Simplest but requires build-time tooling and may be harder to debug

### Current Status
Both files now have consistent behavior and have been updated with:
- Performance improvements (precompiled regex patterns)
- UX improvements (language codes instead of country codes)
- Matching code style for each platform (mobile: single quotes/2-space, desktop: double quotes/4-space)

### Next Steps
1. Evaluate team preference for shared code architecture
2. Set up monorepo tooling or shared package infrastructure
3. Extract common logic and update imports
4. Update build processes for both platforms
5. Add tests to ensure both platforms continue to work correctly
