/* jshint node: true */

/*
 * Plugin for use in conjunction with i18n-webpack-plugin. Wraps assets-webpack-plugin to
 * build an asset path JSON file pointing to asset bundles for each specified locale.
 *
 * Usage:
 *
 *	{
 *		output: {
 *			...
 *			filename: '[name].[chunkhash].[FAST_LOCALE].js',
 *			chunkFilename: '[name].[chunkhash].[FAST_LOCALE].js'
 *		},
 *		plugins: {
 *			new AssetsPlugin({
 *				filename: 'js-asset-paths.json',
 *				path: 'path/to/output/assets/json/'
 *				locales: ['en-US', 'es-ES', 'hu-HU']
 *			})
 *		}
 * }
 */

const fs = require('fs');
const path = require('path');
const AssetsPlugin = require('assets-webpack-plugin');

/**
 * @param {object} options - config options
 * @param {string} options.path - path to output assets JSON
 * @param {string} [options.filename='webpack-assets.json'] - filename to use for assets JSON
 * @param {string} options.publicPath - public bundle path that assets JSON should reference
 * @param {string} [options.localePlaceholder='[FAST_LOCALE]'] - placeholder string for locale in file paths
 */
function PostCompileI18nAssetsPlugin(options) {
	this.PLUGIN_NAME = 'PostCompileI18nAssetsPlugin';
	this.assetsPlugin = new AssetsPlugin(options);
	this.options = options || {};
	this.localePlaceholder = this.options.localePlaceholder || '[FAST_LOCALE]';
	this.locales = this.options.locales;
}

PostCompileI18nAssetsPlugin.prototype = {
	constructor: PostCompileI18nAssetsPlugin,

	apply: compiler => {
		const self = this;

		self.assetsPlugin.apply(compiler);

		const afterEmit = (compiler, callback) => {
			const outputDir = self.options.path || '.';
			const outputFilename = self.options.filename || 'webpack-assets.json';
			const outputFull = path.join(outputDir, outputFilename);
			const assets = JSON.parse(fs.readFileSync(outputFull, { encoding: 'utf8' }));

			Object.keys(assets).forEach(assetName => {
				const asset = assets[assetName];
				if (asset.js) {
					const assetPath = asset.js;
					if (assetPath.indexOf(self.localePlaceholder) > -1) {
						self.locales.forEach(locale => {
							assets[assetName + '.' + locale] = assetPath.replace(self.localePlaceholder, locale);
						});
						delete assets[assetName];
					}
				}
			});

			delete assets[''];

			fs.writeFileSync(outputFull, JSON.stringify(assets));

			callback();
		};

		compiler.hooks.afterEmit.tapAsync(self.PLUGIN_NAME, afterEmit);
	}
};

module.exports = PostCompileI18nAssetsPlugin;
