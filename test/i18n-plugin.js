'use strict';

/* jshint node:true*/
/*global describe, it, require*/

var assert = require('assert'),
	I18nPlugin = require('../i18n-plugin');

describe('I18nPlugin', function () {

	it('should initialize with minimal arguments', function () {
		var assetsPlugin = new I18nPlugin({
			localePath: '.',
			locales: ['en-US', 'hu-HU']
		});
		assert.equal(I18nPlugin.prototype.isPrototypeOf(assetsPlugin), true);
	});

});

