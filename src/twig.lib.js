// ## twig.lib.js
//
// This file contains 3rd party libraries used within twig.
//
// Copies of the licenses for the code included here can be found in the
// LICENSES.md file.
//

module.exports = function (Twig) {
    const { sprintf } = require('locutus/php/strings/sprintf');
    const { vsprintf } = require('locutus/php/strings/vsprintf');
    const { strip_tags } = require('locutus/php/strings/strip_tags');
    const { round } = require('locutus/php/math/round');
    const { min } = require('locutus/php/math/min');
    const { max } = require('locutus/php/math/max');
    const { strtotime } = require('locutus/php/datetime/strtotime');
    const { date } = require('locutus/php/datetime/date');
    const { boolval } = require('locutus/php/var/boolval');

    // Namespace for libraries
    Twig.lib = { };

    Twig.lib.sprintf = sprintf;
    Twig.lib.vsprintf = vsprintf;
    Twig.lib.round = round;
    Twig.lib.max = max;
    Twig.lib.min = min;
    Twig.lib.stripTags = strip_tags;
    Twig.lib.strtotime = strtotime;
    Twig.lib.date = date;
    Twig.lib.boolval = boolval;

    // PHP's definition of a numeric string: an optionally signed integer or float,
    // with an optional exponent, surrounded by optional whitespace.
    const numericStringPattern = /^[+-]?(\d+(\.\d*)?|\.\d+)([Ee][+-]?\d+)?$/;

    const isNumericString = function (value) {
        return typeof value === 'string' && numericStringPattern.test(value.trim());
    };

    const isPlainObject = function (value) {
        if (value === null || typeof value !== 'object' || Array.isArray(value)) {
            return false;
        }

        const prototype = Object.getPrototypeOf(value);
        return prototype === null || prototype === Object.prototype;
    };

    // Twig arrays and Twig hashes are both PHP arrays, so they compare the same way.
    const isPhpArray = function (value) {
        return Array.isArray(value) || isPlainObject(value);
    };

    const phpArrayEntries = function (value) {
        if (Array.isArray(value)) {
            return value.map((item, index) => [String(index), item]);
        }

        // `_keys` records hash key order for twig.js and is not part of the data.
        return Object.keys(value)
            .filter(key => key !== '_keys')
            .map(key => [key, value[key]]);
    };

    // `Twig.lib.boolval` is locutus's, which reads a JS object as a PHP object and so
    // reports even an empty one as true. That is correct for PHP — only an empty
    // array is falsy, an empty stdClass is not — but a JS object here is a Twig hash,
    // which compiles to a PHP associative array. Comparisons need that reading.
    const phpBoolval = function (value) {
        if (value === undefined || value === null) {
            return false;
        }

        if (typeof value === 'boolean') {
            return value;
        }

        if (typeof value === 'number') {
            return value !== 0;
        }

        if (typeof value === 'string') {
            return value !== '' && value !== '0';
        }

        if (isPhpArray(value)) {
            return phpArrayEntries(value).length > 0;
        }

        return true;
    };

    const looseEqualsStrings = function (a, b) {
        if (isNumericString(a) && isNumericString(b)) {
            return Number(a) === Number(b);
        }

        return a === b;
    };

    const looseEqualsPhpArrays = function (a, b) {
        const entriesA = phpArrayEntries(a);
        const entriesB = phpArrayEntries(b);

        if (entriesA.length !== entriesB.length) {
            return false;
        }

        const lookupB = new Map(entriesB);

        return entriesA.every(([key, value]) => lookupB.has(key) &&
            Twig.lib.looseEquals(value, lookupB.get(key)));
    };

    /**
     * Compare two values the way PHP 8 compares them with `==`.
     *
     * Twig compiles `==` straight through to PHP's `==`, whose rules differ from
     * JavaScript's in ways that change rendered output — most visibly
     * `null == false`, which is true in PHP and false in JavaScript.
     *
     * @param {*} left Left operand.
     * @param {*} right Right operand.
     *
     * @returns {boolean} Whether the operands are loosely equal.
     */
    Twig.lib.looseEquals = function (left, right) {
        // Twig resolves an undefined variable to null.
        const a = left === undefined ? null : left;
        const b = right === undefined ? null : right;

        if (a === null && b === null) {
            return true;
        }

        // Since PHP 8, null compared against a string casts null to ''. This rule is
        // narrower than the boolean rule below, so it has to be applied first.
        if (a === null && typeof b === 'string') {
            return looseEqualsStrings('', b);
        }

        if (b === null && typeof a === 'string') {
            return looseEqualsStrings(a, '');
        }

        // A null or boolean operand casts both sides to boolean.
        if (a === null || b === null || typeof a === 'boolean' || typeof b === 'boolean') {
            return phpBoolval(a) === phpBoolval(b);
        }

        if (a instanceof Date && b instanceof Date) {
            return a.getTime() === b.getTime();
        }

        if (isPhpArray(a) || isPhpArray(b)) {
            // PHP 8 ranks an array above every non-array, so the two are never equal.
            return isPhpArray(a) && isPhpArray(b) && looseEqualsPhpArrays(a, b);
        }

        // Anything else that is not a scalar — dates, Drupal attribute objects, class
        // instances — keeps JavaScript's identity comparison.
        if (typeof a === 'object' || typeof a === 'function' ||
            typeof b === 'object' || typeof b === 'function') {
            return a === b;
        }

        if (typeof a === 'string' && typeof b === 'string') {
            return looseEqualsStrings(a, b);
        }

        // A number against a string compares numerically only when the string is
        // numeric; since PHP 8 anything else compares the two as strings.
        if ((typeof a === 'string' && !isNumericString(a)) ||
            (typeof b === 'string' && !isNumericString(b))) {
            return String(a) === String(b);
        }

        return Number(a) === Number(b);
    };

    Twig.lib.is = function (type, obj) {
        if (typeof obj === 'undefined' || obj === null) {
            return false;
        }

        switch (type) {
            case 'Array':
                return Array.isArray(obj);
            case 'Date':
                return obj instanceof Date;
            case 'String':
                return (typeof obj === 'string' || obj instanceof String);
            case 'Number':
                return (typeof obj === 'number' || obj instanceof Number);
            case 'Function':
                return (typeof obj === 'function');
            case 'Object':
                return obj instanceof Object;
            default:
                return false;
        }
    };

    Twig.lib.replaceAll = function (string, search, replace) {
        // Convert type to string if needed
        const stringToChange = typeof string === 'string' ? string : string.toString();
        // Escape possible regular expression syntax
        const searchEscaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return stringToChange.replace(new RegExp(searchEscaped, 'g'), replace);
    };

    // Chunk an array (arr) into arrays of (size) items, returns an array of arrays, or an empty array on invalid input
    Twig.lib.chunkArray = function (arr, size) {
        const returnVal = [];
        let x = 0;
        const len = arr.length;

        if (size < 1 || !Array.isArray(arr)) {
            return [];
        }

        while (x < len) {
            returnVal.push(arr.slice(x, x += size));
        }

        return returnVal;
    };

    return Twig;
};
