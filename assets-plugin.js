/* jshint node: true */
/* global JSON */

'use strict';

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
var fs = require('fs'),
	path = require('path'),

	AssetsPlugin = require('assets-webpack-plugin');

/**
 * @param {object} options - config options
 * @param {string} options.path - path to output assets JSON
 * @param {string} [options.filename='webpack-assets.json'] - filename to use for assets JSON
 * @param {string} options.publicPath - public bundle path that assets JSON should reference
 * @param {string} [options.localePlaceholder='[FAST_LOCALE]'] - placeholder string for locale in file paths
 */
function PostCompileI18nAssetsPlugin(options) {
	this.assetsPlugin = new AssetsPlugin(options);
	this.options = options || {};
	this.localePlaceholder = this.options.localePlaceholder || '[FAST_LOCALE]';
	this.locales = this.options.locales;
}

PostCompileI18nAssetsPlugin.prototype.apply = function (compiler) {
	var self = this;
	this.assetsPlugin.apply(compiler);
	compiler.plugin('after-emit', function (compiler, callback) {
		var outputDir = self.options.path || '.',
			outputFilename = self.options.filename || 'webpack-assets.json',
			outputFull = path.join(outputDir, outputFilename),
			assets = JSON.parse(fs.readFileSync(outputFull, { encoding: 'utf8' }));

		Object.keys(assets).forEach(function (assetName) {
			var asset = assets[assetName],
				assetPath;
			if (asset.js) {
				assetPath = asset.js;
				if (assetPath.indexOf(self.localePlaceholder) > -1) {
					self.locales.forEach(function (locale) {
						assets[assetName + '.' + locale] = assetPath.replace(self.localePlaceholder, locale);
					});
					delete assets[assetName];
				}
			}
		});

		fs.writeFileSync(outputFull, JSON.stringify(assets));

		callback();
	});
};

module.exports = PostCompileI18nAssetsPlugin;
