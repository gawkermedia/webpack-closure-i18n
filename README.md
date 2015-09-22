# webpack-closure-i18n

**(NOTE: this project is new and experimental -- it may still be rather buggy)**

This is a set of two Webpack plugins for translating Closure Templates in a "post-build" fashion. After
Webpack has already built asset bundles, but before it has emitted them, the i18n plugin translates
all `MSG_EXTERNAL_(\d+)` definitions found in the bundles into locale-specific output.

This is intended as a fast alternative to the multi-compiler approach to translation shown in
https://github.com/webpack/webpack/tree/master/examples/i18n. While that approach works nicely for
projects of many sizes, it becomes slow in projects with very large dependency trees or a large number
of translations, as it forces Webpack to handle a dependency tree that with size matching
`NUMBER_OF_DEPENDENCIES * NUMBER_OF_TRANSLATIONS`.

## PostCompileI18nPlugin

This plugin handles the actual translation. See i18n-plugin.js for documentation on usage.

## PostCompileI18nAssetsPlugin

This plugin handles generating a JSON file mapping bundle names to locale-specific bundle paths.
See assets-plugin.js for documentation.
