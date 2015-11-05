'use strict';

/* jshint node:true*/
/*global __dirname, describe, it, before, require*/

var assert = require('assert');
var ClosureTranslater = require('../lib/closure-translater');
var fs = require('fs');
var path = require('path');

var fixturePath = path.join(__dirname, 'fixtures/');

function readFixture(name) {
	return fs.readFileSync(path.join(fixturePath, name), {'encoding': 'utf8'});
}

describe('ClosureTranslater', function() {

	var translater;

	before(function (done) {
		translater = new ClosureTranslater({
			localeFiles: {
				'en-US': path.join(fixturePath, 'en-US.xlf'),
				'es-ES': path.join(fixturePath, 'es-ES.xlf')
			},
			defaultLocale: 'en-US',
			replacementString: '[FAST_LOCALE]'
		});
		translater.messagesLoaded.then(done.bind(null, null));
	});

	it('should translate simple string as expected', function () {
		var translations = translater.translate(readFixture('literal.js'));
		assert.equal(translations['es-ES'], '// Simple literal string\n' + 'var MSG_EXTERNAL_9133897793175013620 = \'Aún guardando...\';\n\n');
	});

	it('should translate message with links as expected', function () {
		var translations = translater.translate(readFixture('link.js')),
			expected = '// Links\n\n\n\n' +
				'var MSG_EXTERNAL_9138152196605060651 = \'Acepto los \' + \'<a href="http://legal.kinja.com/kinja-terms-of-use-90161644"' +
				' target="_blank" class="primary-color">\' + \'Términos de Uso\' + \'</a>\'' +
				' + \'.\';' + '\n\n';
		assert.equal(translations['es-ES'], expected);
	});

	it('should translate message with variables as expected', function () {
		var translations = translater.translate(readFixture('variables.js'));
		assert.equal(translations['es-ES'], '// Variables' + '\n\n\n\n' + 
			'var MSG_EXTERNAL_8973741402914534427 = \'Aprobar \' + soy.$$escapeHtml(opt_data.post.authorBlogName) + \' en \' + ' +
			'soy.$$escapeHtml(blogDisplayName__soy6692);\n\n');
	});

	it('should gracefully handle simple string with missing translations', function () {
		var translations = translater.translate(readFixture('literal-with-missing-locale-file-message.js')),
			expected = '// Simple literal string, with definition missing from locale files\n' +
					'var MSG_EXTERNAL_9133797763175013623 = \'One hundred million dollars.\';\n\n';
		assert.equal(translations['es-ES'], expected);
	});
});

