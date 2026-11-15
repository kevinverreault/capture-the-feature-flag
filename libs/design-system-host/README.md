# @ctff/design-system-host

Lets an Astro app consume [`kevinverreault/design-system`](https://github.com/kevinverreault/design-system) from the `vendor/design-system` submodule. See [Using the design system in an Astro app](../../README.md#using-the-design-system-in-an-astro-app) for the host setup.

- `designSystem()` (default export): an Astro integration that resolves `@ds/*` to the submodule's `src/*` and `@styles/*` to its styles, puts the script of the design system's `ThemeInit` in every page's `<head>` (so a theme chosen with `ThemeToggle` survives page loads), and fails the build if the host has no `src/svg/` folder.
- `@ctff/design-system-host/tsconfig.json`: the matching tsconfig preset for `astro check`.

The tests build the fixture hosts in `test/fixtures/` with `astro build`.
