# Repository Guidelines

## Project Structure & Module Organization

`src/main.ts` connects the UI to Tauri. UI code lives in `public/ui/`; Rust code is under `src-tauri/src/`. Keep commands in `commands.rs`, persistence in `library.rs`, PDF work in `pdf.rs`, and platform integration in `platform.rs`. Assets belong in `public/`, documentation in `docs/`, and PowerShell workflows in `scripts/`.

Generated directories (`dist/`, `node_modules/`, `.build/`, `.toolchain/`, and `.tools/`) are ignored. Preserve `.build/dev-data/`; it contains the development library and test materials.

## Build, Test, and Development Commands

- `npm ci` installs the locked frontend dependencies.
- `.\scripts\dev.ps1` prepares project-local paths and starts the Tauri development app.
- `.\scripts\check.ps1` builds the frontend and runs Rust compile checks.
- `npm run build` performs the TypeScript and Vite production build.
- `cargo test --manifest-path src-tauri/Cargo.toml --locked --lib` runs Rust library tests after loading `.\scripts\env.ps1`.
- `.\scripts\build.ps1` builds the application without an installer.
- `.\scripts\package.ps1` creates the signed NSIS installer and updater manifest; use it only for release work.

## Coding Style & Naming Conventions

Use two-space indentation in TypeScript/JavaScript and four spaces in Rust. Use `camelCase` in browser code, `snake_case` in Rust, and descriptive kebab-case CSS classes. Keep UI text in clear Simplified Chinese. Avoid reformatting unrelated compact sections. Run `git diff --check` before committing.

## Testing Guidelines

Add Rust unit tests beside the module they exercise using `#[cfg(test)]` and behavior-focused names. Test persistence, page selection, and PDF output with temporary data. For UI changes, build the frontend and manually verify narrow and desktop sizes. Never use installed-user data.

## Commit & Pull Request Guidelines

History uses short imperative subjects, for example `Stabilize desktop workflows`. Keep each commit reviewable. Pull requests should state user-visible behavior, validation, and data or updater implications; include screenshots for visual changes and link related issues.

## Security & Release Configuration

Never commit `.secrets/`, updater private keys, login tokens, databases, or downloaded course materials. Keep development data inside `.build/dev-data/`; installed data belongs in the current user's Local AppData directory. Update versions consistently in `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, and `src-tauri/tauri.conf.json`. Do not push, tag, or publish a release unless the task explicitly requests it.

## Shell on Windows

Use PowerShell 7 (`pwsh`) exclusively; never invoke legacy `powershell.exe`. Run scripts as `pwsh -NoProfile -File .\scripts\<name>.ps1` and keep console output UTF-8.
