/* jshint node: true */

'use strict';

var _ = require('underscore'),
	esprima = require('esprima'),
	escodegen = require('escodegen'),
	q = require('q'),
	underscored = require('underscore.string/underscored'),

	readTranslationFile = require('./translation-parser'),

	messageRegex = /var MSG_EXTERNAL_(\d+) = (.+)/,

	ClosureTranslater,
	localeDataPromises;

/**
 * Returns the specified string as an `'`-enclosed string suitable for printing to JS
 */
function toJSString(str) {
	return '\'' + str.replace(/'/g, '\\\'') + '\'';
}

/**
 * Represents a parsed goog.getMsg call
 * @param {object} opts - object with the following keys:
 * @param {string} opts.id - ID of the message
 * @param {string} opts.definition - JS source of the getMsg function call
 */
function MessageCall(opts) {
	this.id = opts.id;
	this.definition = opts.definition;
}

/**
 * Given contents of a JS file and object containing translations, build translated versions of the file
 * @param {string} fileContents - string representing contents of a JS file to translate
 * @param {object[string: Array[TranslationParser.MessageTranslation]]} translations - arrays of MessageTranslations keyed by locale filename
 * @param {string} defaultLocale - name of default locale to use (when locale-specific message not found)
 * @param {RegExp} [replacementRegex] - regex that should be replaced with locale name
 * @returns {object[string: string]} - Promise for object containing translated versions of the file, keyed by locale
 */
function buildI18n(fileContents, translations, defaultLocale, replacementRegex) {

	fileContents = fileContents.split('\n');

	var translatedOutput = {},
		currentMessageCall;

	Object.keys(translations).forEach(function (lang) {
		translatedOutput[lang] = '';
	});

	/**
	 * Given an AST representing a call to goog.getMsg(), extract any keys and values passed in to the message string template.
	 * @param {ESTree} syntaxTree - Esprima AST representing goog.getMsg() call
	 * @returns {object|false} - mapping of message template string variable key names to values, or false if it was a simple
	 *								goog.getMsg('string') call with no extra arguments passed in.
	 *							Key names are formatted to match <x id> tags in translations, e.g. "AUTHOR_BLOG_NAME"
	 */
	function getGoogMsgArguments(syntaxTree) {
		if (syntaxTree.body[0].expression) {
			var templateArgumentsObject = syntaxTree.body[0].expression.arguments[1];  // jshint ignore:line
			if (templateArgumentsObject) {
				return _.object(templateArgumentsObject.properties.map(function (property) {
					console.assert(property.key.type === 'Literal', 'Non-literal key names not supported!');
					return [underscored(property.key.value).toUpperCase(), escodegen.generate(property.value)];
				}));
			}
		}
		return false;
	}

	/**
	 * Given a line of text, replace any locale placeholders with specified locale
	 * @param {string} line - line of text
	 * @param {string} locale - name of locale
	 */
	function replaceLocaleName(line, locale) {
		if (replacementRegex && line.match(replacementRegex)) {
			line = line.replace(replacementRegex, locale);
		}
		return line;
	}

	/**
	 * There are two types of goog.getMsg call to handle:
	 *
	 * 1. Simple: `goog.getMsg('Some string');`
	 * 2. Template string + arguments object:
	 *
	 *	```
	 *	goog.getMsg(
	 *	'Unfollow {$authorBlogName}',
	 *	{'authorBlogName': soy.$$escapeHtml(opt_data.post.authorBlogName)});
	 *	```
	 *
	 * To process the goog.getMsg() calls, we:
	 *
	 * - Read the input file line by line
	 * - When a goog.getMsg() call is encountered:
	 *		- Assume that the expression statement of the goog.getMsg() call starts on its own line
	 *			and ends on its own line
	 *		- Attempt to create an AST from the call. If it fails, assume we have more lines to read to
	 *			complete the expression statement.
	 *		- Once we have a full expression statement for the goog.getMsg() call, extract any
	 *			arguments passed to the template string by the call.
	 *		- Replace the goog.getMsg call with the appropriate internationalized string, using the
	 *			arguments that were passed to the goog.getMsg call.
	 */

	fileContents.forEach(function (line) {
		var definitionAST,
			match,
			templateArguments;

		// Are we starting a message definition?
		if ((line.indexOf('goog.getMsg(') > -1) && (match = line.match(messageRegex))) {
			currentMessageCall = new MessageCall({
				id: match[1],
				definition: match[2]
			});
		} else if (currentMessageCall) {
			currentMessageCall.definition += line + '\n';
		}

		/**
		 * Return whether the given argument is a literal
		 * @param {object} argumentAST an argument object from a CallExpression AST
		 */
		function argumentIsLiteral(argumentAST) {
			return (argumentAST.type === 'Literal');
		}

		// Are we continuing a message definition?
		if (currentMessageCall) {
			try {
				definitionAST = esprima.parse(currentMessageCall.definition);
			} catch (e) {}
			if (definitionAST) {
				// We have a complete message definition!

				templateArguments = getGoogMsgArguments(definitionAST);

				Object.keys(translations).forEach(function (locale) {
					var messageID = currentMessageCall.id,
						msgTranslation = translations[locale][messageID],
						target,
						translatedMessage;

					if (!msgTranslation && translations[defaultLocale][messageID]) {
						// Message not present in translation file -- fall back to default locale's message
						msgTranslation = translations[defaultLocale][messageID];
					} else if (!msgTranslation) {

						// Locale file changes must've not been committed - attempt to use the arguments to goog.getMsg()
						// as the translation string (but only if they're literal).
						if ((definitionAST.body[0].expression.type === 'CallExpression') &&
								_.every(definitionAST.body[0].expression.arguments, argumentIsLiteral)) {
							msgTranslation = {
								target: definitionAST.body[0].expression.arguments.map(function (arg) {
									return arg.value;
								})
							};
						} else {
							throw new Error('Failed to find translation for message ID: ' + messageID);
						}
					}

					// Use source text if no target translation was found
					target = msgTranslation.target;
					if (!(target && target.length)) {
						target = msgTranslation.source;
					}

					// Someone's trying to translate an empty string. Why? Who knows, warn about it but proceed...
					if (!target.length) {
						console.warn('Empty translation for message ID:', messageID);
						target = [''];
					}

					// Replace any tokens with JS value for token that was passed in as a template argument
					target = target.map(function (stringOrToken) {
						if (typeof stringOrToken === 'object') {
							return templateArguments[stringOrToken.id];
						} else {
							return toJSString(stringOrToken);
						}
					});

					translatedMessage = 'var MSG_EXTERNAL_' + messageID + ' = ' + target.join(' + ') + ';\n';
					translatedOutput[locale] += translatedMessage;
				});

				currentMessageCall = null;
			} else {
				// Add spacer line so that source maps behave still
				Object.keys(translations).forEach(function (locale) {
					translatedOutput[locale] += '\n';
				});
			}
		} else {
			// Just replace any instances of locale name token on the line, there are no translation strings to replace
			Object.keys(translations).forEach(function (locale) {
				var translatedLine = replaceLocaleName(line, locale);
				translatedOutput[locale] += translatedLine + '\n';
			});
		}

	});

	return translatedOutput;
}

/**
 * Handy helper for loading locale files and using them to translate strings.
 *
 * Usage:
 *
 * var translater = new ClosureTranslater({
 *		localeFiles: {
 *			'en-US': '/path/to/en-US.xlf',
 *			'es-ES': '/path/to/es-ES.xlf'
 *		},
 *		defaultLocale: 'en-US',
 *		replacementString: '[SOME-TOKEN-TO-REPLACE-WITH-LOCALE-NAME]'
 * });
 * translater.messagesLoaded.then(function () {
 *    var fileContents = fs.readFileSync('file.js', {'encoding: 'utf8'});
 *    var translations = translater.translate(fileContents);
 *    console.log("translated for es-ES locale: ", translations['es-ES']);
 * });
 * @param {object} options - config options
 * @param {array[string]} options.localeFiles - filenames of locale files to use for translation
 * @param {string} options.defaultLocale - name of default locale to use for translations (when no locale-specific translation found)
 * @param {string} [options.replacementString] - name of a string to replace with the current locale name
 */
ClosureTranslater = function (options) {
	var instance = this,
		messageFilenames,
		filenamesToLocales;

	this.defaultLocale = options.defaultLocale;
	this.localeFilenames = options.localeFiles;
	messageFilenames = _.values(this.localeFilenames);
	filenamesToLocales = _.invert(this.localeFilenames);

	if (options.replacementString) {
		this.replacementRegex = new RegExp(options.replacementString.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, '\\$1'), 'g');
	}

	this.messages = null;

	function loadMessages() {
		localeDataPromises = messageFilenames.map(function (filename) {
			return readTranslationFile(filename).then(function (messages) {
				return [filenamesToLocales[filename], messages];
			});
		});
		return q.all(localeDataPromises).then(function (localeData) {
			instance.messages = _.object(localeData);
			return instance.messages;
		}, function () {
			throw new Error('Failed to load locale data');
		});
	}
	this.messagesLoaded = loadMessages();
};

/**
 * Translates the specified file using the configured locales.
 * @param {string} fileContents - string containing the contents of a file. Any goog.getMsg() function calls
 *									that require translation should begin and end without other content on
 *									the same lines.
 * @return {object} translations, each one keyed by filename of corresponding locale file
 */
ClosureTranslater.prototype.translate = function (fileContents) {
	if (!this.messages) {
		throw new Error('You must wait on the messagesLoaded Promise to ensure translations are loaded before calling translate()');
	}
	return buildI18n(fileContents, this.messages, this.defaultLocale, this.replacementRegex);
};

module.exports = ClosureTranslater;
