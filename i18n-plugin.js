/* jshint node: true */

'use strict';

var path = require('path'),
	ConcatSource = require('webpack/lib/ConcatSource'),
	Translater = require('./lib/closure-translater');

/**
 * Plugin for translating Closure Templates in already-built Webpack chunks.
 *
 * @param {object} config - configuration object
 * @param {array[string]} config.locales - Closure locale names to translate to
 * @param {string} config.localePath - Base path to load locale files from
 * @param {boolean} [config.appendSourceMapLink=false] - Whether to append a link to sourcemap in generated files
 * @param {string} [config.defaultLocale] - Default locale to use (e.g. when translation not available for specific locale)
 * @param {array[string]} [config.modules] - List of modules to translate (will translate all chunks if none specified here)
 * @param {string} [config.localeNameTemplateVar] - String to replace any instance of with locale name
 * @param {object} [config.localeAliases] - optional aliases for file path for a given locale. (e.g.:
 *	`{"en-US": "generated/extracted_msgs"}` if the `en-US` file path is `generated/extracted_msgs.xlf`
 *	instead of `en-US.xlf`
 */
function PostCompileI18nPlugin(config) {
	if (!config.locales && config.locales.length) {
		throw new Error('An array of Closure locales (e.g. ["en-US", "es-ES"]) must be defined.');
	}
	if (!config.localePath) {
		throw new Error('localePath must be set and pointed to the base path of locale files');
	}

	this.appendSourceMapLink = Boolean(config.appendSourceMapLink);
	this.defaultLocale = config.defaultLocale || 'en-US';
	this.locales = config.locales;
	this.localePath = config.localePath;
	this.localeAliases = config.localeAliases || {};
	this.modules = config.modules || [];
	this.localeNameTemplateVar = config.localeNameTemplateVar || '[FAST_LOCALE]';
}

module.exports = PostCompileI18nPlugin;

PostCompileI18nPlugin.prototype.apply = function (compiler) {
	var instance = this;

	this.translater = null;
	this.localeFiles = {};

	// Load translation messages when compilation begins
	function onRun(compiler, callback) {
		var translater;
		instance.locales.forEach(function (locale) {
			instance.localeFiles[locale] = path.join(instance.localePath, (instance.localeAliases[locale] || locale) + '.xlf');
		});
		translater = instance.translater = new Translater({
			localeFiles: instance.localeFiles,
			defaultLocale: instance.defaultLocale,
			replacementString: instance.localeNameTemplateVar
		});
		translater.messagesLoaded.then(function () {
			callback();
		}, function () {
			throw new Error('Failed to load translations!');
		});
	}
	compiler.plugin('run', onRun);
	compiler.plugin('watch-run', onRun);

	compiler.plugin('compilation', function (compilation) {

		compilation.plugin('additional-chunk-assets', function (chunks) {
			function translateChunk(chunk) {
				chunk.files.forEach(function (filename) {
					var originalSource = compilation.assets[filename].source(),
						translations = instance.translater.translate(originalSource);
					instance.locales.forEach(function (locale) {
						var localizedFilename = filename.replace(instance.localeNameTemplateVar, locale),
							source = instance.appendSourceMapLink ? new ConcatSource(translations[locale] +
							'\n//# sourceMappingURL=' + filename + '.map') : new ConcatSource(translations[locale]);
						compilation.additionalChunkAssets.push(localizedFilename);
						compilation.assets[localizedFilename] = source;
					});
				});
			}

			var filteredChunks;

			if (instance.modules.length) {  // Module names specified - only translate these modules
				filteredChunks = chunks.filter(function (chunk) {
					if (!chunk.entry && !chunk.initial) {
						// We need to translate all non-entry/non-initial chunks (e.g. lazy-loaded packages)
						return true;
					}
					return (instance.modules.indexOf(chunk.name) > -1);
				});
			} else {  // Translate all modules
				filteredChunks = chunks;
			}
			filteredChunks.forEach(translateChunk);
		});
	});
};
