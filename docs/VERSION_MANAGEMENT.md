# Version Management in Atrax

Atrax uses automated version management to ensure consistent version numbers across all files in the project.

## How It Works

When you use `npm version` to bump the project version, npm scripts are triggered to update the version number in:

1. The ASCII art logo in `ascii_logo.txt`
2. The README.md file
3. The SECURITY.md file

## How to Bump the Version

To bump the version, use one of the following npm commands:

```bash
# Patch version bump (e.g., 1.2.3 -> 1.2.4)
npm version patch

# Minor version bump (e.g., 1.2.3 -> 1.3.0)
npm version minor

# Major version bump (e.g., 1.2.3 -> 2.0.0)
npm version major

# Specific version (replace X.Y.Z with your desired version)
npm version X.Y.Z
```

## What Happens During Version Bump

When you run `npm version`, the following occurs automatically:

1. The version in package.json is updated
2. The `version` npm script is triggered, which:
   - Updates the version in the ASCII logo
   - Updates the version in README.md
   - Updates the version in SECURITY.md
   - Adds these files to git staging
3. The `postversion` npm script is triggered, which:
   - Pushes the changes to the remote repository
   - Pushes the new version tag to the remote repository

## Manual Version Updates

If you need to manually update the version in a specific file, you can run:

```bash
# Update version in ASCII logo
npm run bump:logo

# Update version in README.md and SECURITY.md
npm run bump:readme
```

## Adding New Files to Version Management

If you need to add more files to the version management system:

1. Add a new script to package.json:
   ```json
   "bump:yourfile": "replace 'v[0-9]+\\.[0-9]+\\.[0-9]+' \"v$npm_package_version\" ./path/to/your/file"
   ```

2. Add the new script to the `version` script in package.json:
   ```json
   "version": "npm run bump:logo && npm run bump:readme && npm run bump:yourfile && git add ./ascii_logo.txt ./README.md ./SECURITY.md ./path/to/your/file"
   ```
