'use strict';

/* jshint node:true*/
/*global describe, it, require*/

var assert = require('assert'),
	AssetsPlugin = require('../assets-plugin');

describe('AssetsPlugin', function () {

	it('should initialize with minimal arguments', function () {
		var assetsPlugin = new AssetsPlugin({
			filename: 'js-asset-paths.json',
			path: '.',
			locales: ['en-US', 'hu-HU']
		});
		assert.equal(AssetsPlugin.prototype.isPrototypeOf(assetsPlugin), true);
	});

});

