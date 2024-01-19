/* jshint node: true */

'use strict';

const path = require('path');
const Translater = require('fast-closure-translater');

/**
 * Plugin for translating Closure Templates in already-built Webpack chunks.
 *
 * @param {object} config - configuration object
 * @param {array[string]} config.locales - Closure locale names to translate to
 * @param {string} config.localePath - Base path to load locale files from
 * @param {string} [config.defaultLocale] - Default locale to use (e.g. when translation not available for specific locale)
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

	this.PLUGIN_NAME = 'PostCompileI18nPlugin';
	this.defaultLocale = config.defaultLocale || 'en-US';
	this.locales = config.locales;
	this.localePath = config.localePath;
	this.localeAliases = config.localeAliases || {};
	this.localeNameTemplateVar = config.localeNameTemplateVar || '[FAST_LOCALE]';
}

PostCompileI18nPlugin.prototype = {
	constructor: PostCompileI18nPlugin,

	apply: function (compiler) {
		const self = this;

		const { ConcatSource } = compiler.webpack.sources;

		self.translater = null;
		self.localeFiles = {};

		// Load translation messages when compilation begins
		const onRun = (compiler, callback) => {
			self.locales.forEach(locale => {
				const localeAlias = self.localeAliases[locale] || locale;
				self.localeFiles[locale] = path.join(self.localePath, localeAlias + '.xlf');
			});
			const translater = new Translater({
				localeFiles: self.localeFiles,
				defaultLocale: self.defaultLocale,
				replacementString: self.localeNameTemplateVar
			});

			self.translater = translater;

			translater.messagesLoaded
				.then(
					() => { callback(); },
					() => { throw new Error('Failed to load translations!'); }
				);
		}

		compiler.hooks.run.tapAsync(self.PLUGIN_NAME, onRun)
		compiler.hooks.watchRun.tapAsync(self.PLUGIN_NAME, onRun)

		compiler.hooks.compilation.tap(self.PLUGIN_NAME, compilation => {
			compilation.hooks.processAssets.tap({
				name: self.PLUGIN_NAME,
				stage: 101 // @todo Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE + 1
			}, assets => {
				Object.entries(assets).forEach(([pathname, asset]) => {
					const source = asset.source();
					const translations = self.translater.translate(source);

					self.locales.forEach(locale => {
						const translatedPathname = pathname.replace(self.localeNameTemplateVar, locale);
						const translatedSource = new ConcatSource(translations[locale]);

						compilation.additionalChunkAssets.push(translatedPathname);
						compilation.assets[translatedPathname] = translatedSource;
					});
				});
			});

		});
	}
};

module.exports = PostCompileI18nPlugin;
