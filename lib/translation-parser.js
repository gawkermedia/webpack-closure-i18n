/* jshint node: true */

/**
 * Parse Closure Template .XLF translation files, returning ordered arrays of source and target translation
 * text and <x id> tokens.
 *
 * Usage:
 *
 * var readTranslationFile = require('translation-parser');
 *
 * readTranslationFile(arrayOfTranslationFilePaths).then(function (translationsByLocale) {
 *		...
 * });
 *
 * (See further documentation below).
 *
 * Implemented as a SAX Parser because xml2js and other common more high-level Node XML libraries fail
 * to properly return ordered arrays of child nodes when the nodes are a mix of text nodes and elements.
 */

'use strict';

var fs = require('fs'),
	q = require('q'),
	sax = require('sax');

/**
 * Represents translation tag information extracted from XLIFF translation file XML
 * @param {string} id - translation ID
 * @param {string} datatype - type of data (e.g. "html")
 */
function MessageTranslation(id, datatype) {
	this._sourceTagOpen = false;
	this._targetTagOpen = false;
	this.id = id;
	this.datatype = datatype;
	this.source = [];
	this.target = [];
}

/**
 * Reads translation file and returns a Promise
 *
 * @param {Array[String]} paths - paths to translation files
 * @returns {Promise({[Object[Object]]})} Promise for a translation list object matching format:
 *
 * {
 *		"23523532532532": {
 *			source: ['some translation string', 'it can also contain:', {object}],
 *			target: ['some translation string', 'it can also contain:', {object}]
 *		},
 *		...
 * }
 */
function readTranslationFile(path) {

	var deferred = q.defer(),
		currentMessageTranslation, localeXML, saxStream, localeTranslations = {};

	localeXML = fs.readFileSync(path, 'utf8');

	saxStream = sax.createStream(true, {});

	saxStream.on('opentag', function openTagHandler(node) {
		switch (node.name) {
			case 'trans-unit':
				currentMessageTranslation = localeTranslations[node.attributes.id] = new MessageTranslation(node.attributes.id, node.attributes.datatype);
			break;
			case 'source':
				currentMessageTranslation._sourceTagOpen = true;
			break;
			case 'target':
				currentMessageTranslation._targetTagOpen = true;
			break;
			case 'x':
				if (currentMessageTranslation._sourceTagOpen) {
					currentMessageTranslation.source.push(node.attributes);
				} else if (currentMessageTranslation._targetTagOpen) {
					currentMessageTranslation.target.push(node.attributes);
				}
			break;
		}
	});

	saxStream.on('closetag', function closeTagHandler(nodeName) {
		switch (nodeName) {
			case 'trans-unit':
				currentMessageTranslation = null;
			break;
			case 'source':
				currentMessageTranslation._sourceTagOpen = false;
			break;
			case 'target':
				currentMessageTranslation._targetTagOpen = false;
			break;
		}
	});

	saxStream.on('text', function (node) {
		if (currentMessageTranslation && currentMessageTranslation._sourceTagOpen) {
			currentMessageTranslation.source.push(node);
		} else if (currentMessageTranslation && currentMessageTranslation._targetTagOpen) {
			currentMessageTranslation.target.push(node);
		}
	});

	saxStream.on('error', function () {
		deferred.reject();
	});

	saxStream.on('end', function () {
		deferred.resolve(localeTranslations);
	});

	saxStream.write(localeXML);
	saxStream.end();

	return deferred.promise;
}

module.exports = readTranslationFile;
