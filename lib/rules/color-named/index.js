'use strict';

const declarationValueIndex = require('../../utils/declarationValueIndex');
const isStandardSyntaxFunction = require('../../utils/isStandardSyntaxFunction');
const isStandardSyntaxValue = require('../../utils/isStandardSyntaxValue');
const keywordSets = require('../../reference/keywordSets');
const namedColorDataHex = require('../../reference/namedColorData');
const optionsMatches = require('../../utils/optionsMatches');
const propertySets = require('../../reference/propertySets');
const report = require('../../utils/report');
const ruleMessages = require('../../utils/ruleMessages');
const validateOptions = require('../../utils/validateOptions');
const valueParser = require('postcss-value-parser');
const { isRegExp, isString } = require('../../utils/validateTypes');

const generateColorFuncs = require('./generateColorFuncs');

const ruleName = 'color-named';

const messages = ruleMessages(ruleName, {
	expected: (named, original) => `Expected "${original}" to be "${named}"`,
	rejected: (named) => `Unexpected named color "${named}"`,
});

// Todo tested on case insensitivity
const NODE_TYPES = new Set(['word', 'function']);

/** @type {import('stylelint').Rule} */
const rule = (primary, secondaryOptions) => {
	return (root, result) => {
		const validOptions = validateOptions(
			result,
			ruleName,
			{
				actual: primary,
				possible: ['never', 'always-where-possible'],
			},
			{
				actual: secondaryOptions,
				possible: {
					ignoreProperties: [isString, isRegExp],
					ignore: ['inside-function'],
				},
				optional: true,
			},
		);

		if (!validOptions) {
			return;
		}

		const namedColors = Object.keys(namedColorDataHex);

		/** @type {Record<string, { hex: string[], func: string[] }>} */
		const namedColorData = {};

		for (const name of namedColors) {
			const hex = namedColorDataHex[name];

			namedColorData[name] = {
				hex,
				func: generateColorFuncs(hex[0]),
			};
		}

		root.walkDecls((decl) => {
			if (propertySets.acceptCustomIdents.has(decl.prop)) {
				return;
			}

			// Return early if the property is to be ignored
			if (optionsMatches(secondaryOptions, 'ignoreProperties', decl.prop)) {
				return;
			}

			valueParser(decl.value).walk((node) => {
				const value = node.value;
				const type = node.type;
				const sourceIndex = node.sourceIndex;

				if (optionsMatches(secondaryOptions, 'ignore', 'inside-function') && type === 'function') {
					return false;
				}

				if (!isStandardSyntaxFunction(node)) {
					return false;
				}

				if (!isStandardSyntaxValue(value)) {
					return;
				}

				// Return early if neither a word nor a function
				if (!NODE_TYPES.has(type)) {
					return;
				}

				// Check for named colors for "never" option
				if (primary === 'never' && type === 'word' && namedColors.includes(value.toLowerCase())) {
					complain(messages.rejected(value), decl, declarationValueIndex(decl) + sourceIndex);

					return;
				}

				// Check "always-where-possible" option ...
				if (primary !== 'always-where-possible') {
					return;
				}

				// First by checking for alternative color function representations ...
				if (type === 'function' && keywordSets.colorFunctionNames.has(value.toLowerCase())) {
					// Remove all spaces to match what's in `representations`
					const normalizedFunctionString = valueParser.stringify(node).replace(/\s+/g, '');

					for (const namedColor of namedColors) {
						if (namedColorData[namedColor].func.includes(normalizedFunctionString.toLowerCase())) {
							complain(
								messages.expected(namedColor, normalizedFunctionString),
								decl,
								declarationValueIndex(decl) + sourceIndex,
							);

							return; // Exit as soon as a problem is found
						}
					}

					return;
				}

				// Then by checking for alternative hex representations

				for (const namedColor of namedColors) {
					if (namedColorData[namedColor].hex.includes(value.toLowerCase())) {
						complain(
							messages.expected(namedColor, value),
							decl,
							declarationValueIndex(decl) + sourceIndex,
						);

						return; // Exit as soon as a problem is found
					}
				}
			});
		});

		/**
		 * @param {string} message
		 * @param {import('postcss').Node} node
		 * @param {number} index
		 */
		function complain(message, node, index) {
			report({
				result,
				ruleName,
				message,
				node,
				index,
			});
		}
	};
};

rule.ruleName = ruleName;
rule.messages = messages;
module.exports = rule;
