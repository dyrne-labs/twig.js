const Twig = require('..').factory();

const {twig} = Twig;

describe('Twig.js Expression Operators ->', function () {
    describe('Precedence ->', function () {
        it('should correctly order \'in\'', function () {
            const testTemplate = twig({data: '{% if true or "anything" in ["a","b","c"] %}OK!{% endif %}'});
            const output = testTemplate.render({});

            output.should.equal('OK!');
        });
    });

    describe('// ->', function () {
        it('should handle positive values', function () {
            const testTemplate = twig({data: '{{ 20 // 7 }}'});
            const output = testTemplate.render({});

            output.should.equal('2');
        });

        it('should handle negative values', function () {
            const testTemplate = twig({data: '{{ -20 // -7 }}'});
            const output = testTemplate.render({});

            output.should.equal('2');
        });

        it('should handle mixed sign values', function () {
            const testTemplate = twig({data: '{{ -20 // 7 }}'});
            const output = testTemplate.render({});

            output.should.equal('-3');
        });
    });

    describe('?: ->', function () {
        it('should support the extended ternary operator for true conditions', function () {
            const testTemplate = twig({data: '{{ a ? b }}'});
            const outputT = testTemplate.render({a: true, b: 'one'});
            const outputF = testTemplate.render({a: false, b: 'one'});

            outputT.should.equal('one');
            outputF.should.equal('');
        });

        it('should support the extended ternary operator for false conditions', function () {
            const testTemplate = twig({data: '{{ a ?: b }}'});
            const outputT = testTemplate.render({a: 'one', b: 'two'});
            const outputF = testTemplate.render({a: false, b: 'two'});

            outputT.should.equal('one');
            outputF.should.equal('two');
        });

        it('should support the extended ternary operator for false conditions (with whitespace in between operators)', function () {
            const testTemplate = twig({data: '{{ a ?   : b }}'});
            const outputT = testTemplate.render({a: 'one', b: 'two'});
            const outputF = testTemplate.render({a: false, b: 'two'});

            outputT.should.equal('one');
            outputF.should.equal('two');
        });

        it('should support the extended ternary operator for undefined arguments', function () {
            const testTemplate = twig({data: '{{ test1 ? test1 : test2 }}'});
            const outputA = testTemplate.render({test2: 'text 2'});
            const outputB = testTemplate.render({test1: false});
            const outputC = testTemplate.render({});
            const outputD = testTemplate.render({test1: 'text 1'});

            outputA.should.equal('text 2');
            outputB.should.equal('');
            outputC.should.equal('');
            outputD.should.equal('text 1');
        });
    });

    describe('?? ->', function () {
        it('should support the null-coalescing operator for true conditions', function () {
            const testTemplate = twig({data: '{{ a ?? b }}'});
            const outputT = testTemplate.render({a: 'one', b: 'two'});
            const outputF = testTemplate.render({a: false, b: 'two'});

            outputT.should.equal('one');
            outputF.should.equal('false');
        });

        it('should support the null-coalescing operator for false conditions', function () {
            const testTemplate = twig({data: '{{ a ?? b }}'});
            const outputT = testTemplate.render({a: undefined, b: 'two'});
            const outputF = testTemplate.render({a: null, b: 'two'});

            outputT.should.equal('two');
            outputF.should.equal('two');
        });

        it('should support the null-coalescing operator for true conditions on objects or arrays', function () {
            const testTemplate = twig({data: '{% set b = a ?? "nope" %}{{ b | join("") }}'});
            const outputArr = testTemplate.render({a: [1, 2]});
            const outputObj = testTemplate.render({a: {b: 3, c: 4}});
            const outputNull = testTemplate.render();

            outputArr.should.equal('12');
            outputObj.should.equal('34');
            outputNull.should.equal('nope');
        });
    });

    describe('== and != ->', function () {
        // Every expected value below was captured by rendering the same expression
        // through Twig PHP 3.28 on PHP 8.5, so this table is the reference
        // implementation's behaviour rather than JavaScript's `==`.
        const phpEqualityData = [
            // null (and undefined variables, which Twig treats as null) against booleans.
            ['null == false', {}, 'true'],
            ['null == true', {}, 'false'],
            ['false == null', {}, 'true'],
            ['x == false', {x: null}, 'true'],
            ['x == false', {}, 'true'],
            ['null != false', {}, 'false'],
            ['null != true', {}, 'true'],

            // null against other scalars.
            ['null == 0', {}, 'true'],
            ['null == ""', {}, 'true'],
            ['null == "a"', {}, 'false'],
            ['null == "0"', {}, 'false'],
            ['null == null', {}, 'true'],

            // A boolean operand coerces the other side to boolean.
            ['false == 0', {}, 'true'],
            ['false == ""', {}, 'true'],
            ['false == "0"', {}, 'true'],
            ['false == "false"', {}, 'false'],
            ['false == "a"', {}, 'false'],
            ['true == "true"', {}, 'true'],
            ['true == "a"', {}, 'true'],
            ['true == ""', {}, 'false'],
            ['true == 1', {}, 'true'],
            ['true == 2', {}, 'true'],
            ['true == 0', {}, 'false'],

            // Numbers against strings, following the PHP 8 rules: numeric strings
            // compare numerically, everything else compares as strings.
            //
            // What counts as numeric is PHP's NUM_STRING grammar, which is narrower
            // than JavaScript's: it takes a leading dot or a trailing one, and allows
            // surrounding whitespace, but only the C whitespace set — a non-breaking
            // space makes the string non-numeric, where JavaScript would trim it away.
            ['42 == "+42"', {}, 'true'],
            ['42 == "00042"', {}, 'true'],
            ['42 == "   42"', {}, 'true'],
            ['42 == "42   "', {}, 'true'],
            // Supplied as data rather than written as literals: twig.js does not
            // decode escape sequences inside a quoted literal, so "\t" there is a
            // backslash and a t. That is a separate gap from the comparison rules.
            ['42 == s', {s: '\t\n42\r '}, 'true'],
            ['42 == s', {s: ' 42'}, 'false'],
            ['"5." == 5', {}, 'true'],
            ['".5" == 0.5', {}, 'true'],
            ['".5e3" == 500', {}, 'true'],
            ['1000 == "1_000"', {}, 'false'],
            ['26 == "0x1A"', {}, 'false'],
            ['1 == "1e"', {}, 'false'],
            ['0 == "."', {}, 'false'],
            ['1 == "1"', {}, 'true'],
            ['1 == "01"', {}, 'true'],
            ['"1" == "01"', {}, 'true'],
            ['"10" == "1e1"', {}, 'true'],
            ['1 == 1.0', {}, 'true'],
            ['0 == "foo"', {}, 'false'],
            ['"" == 0', {}, 'false'],
            ['"abc" == 0', {}, 'false'],
            ['"abc" == "abc"', {}, 'true'],
            ['"abc" == "ABC"', {}, 'false'],

            // Twig arrays and hashes are both PHP arrays, so they compare by contents.
            ['[] == false', {}, 'true'],
            ['[] == true', {}, 'false'],
            ['[1] == true', {}, 'true'],
            ['[1, 2] == [1, 2]', {}, 'true'],
            ['[1, 2] == [3, 4]', {}, 'false'],
            ['[1, 2] == [1, 2, 3]', {}, 'false'],
            ['[1, 2] == 2', {}, 'false'],
            ['["1", "2"] == [1, 2]', {}, 'true'],
            ['{} == false', {}, 'true'],
            ['{a: 1} == {a: 1}', {}, 'true'],
            ['{a: 1} == {a: 2}', {}, 'false'],
            ['{a: 1} == {b: 1}', {}, 'false'],
            ['{a: 1, b: 2} == {b: 2, a: 1}', {}, 'true'],
            ['{a: 1} == true', {}, 'true']
        ];

        it('should match Twig PHP loose comparison semantics', function () {
            phpEqualityData.forEach(([expression, context, expected]) => {
                const output = twig({data: '{{ ' + expression + ' }}'}).render(context);

                output.should.equal(expected, expression + ' with ' + JSON.stringify(context));
            });
        });

        it('should treat a missing boolean prop as null when compared against false', function () {
            // Reduced from CivicTheme's text-icon.twig, which is reached through
            // link.twig. `is_external` is documented as [boolean,null], so it is
            // frequently absent, and Twig PHP takes the `show_full_text` branch
            // while twig.js used to take the other one.
            const testTemplate = twig({
                data:
                    '{%- set show_full_text = icon_group_disabled or ' +
                    '(icon_placement == \'before\' and is_external == false) -%}' +
                    '{%- if show_full_text -%}full{%- else -%}split{%- endif -%}'
            });

            testTemplate.render({icon_placement: 'before'}).should.equal('full');
            testTemplate.render({icon_placement: 'before', is_external: null}).should.equal('full');
            testTemplate.render({icon_placement: 'before', is_external: false}).should.equal('full');
            testTemplate.render({icon_placement: 'before', is_external: true}).should.equal('split');
        });
    });

    describe('b-and ->', function () {
        it('should return correct value if needed bit is set or 0 if not', function () {
            const testTemplate = twig({data: '{{ a b-and b }}'});
            const output0 = testTemplate.render({a: 25, b: 1});
            const output1 = testTemplate.render({a: 25, b: 2});
            const output2 = testTemplate.render({a: 25, b: 4});
            const output3 = testTemplate.render({a: 25, b: 8});
            const output4 = testTemplate.render({a: 25, b: 16});

            output0.should.equal('1');
            output1.should.equal('0');
            output2.should.equal('0');
            output3.should.equal('8');
            output4.should.equal('16');
        });
    });

    describe('b-or ->', function () {
        it('should return initial value if needed bit is set or sum of bits if not', function () {
            const testTemplate = twig({data: '{{ a b-or b }}'});
            const output0 = testTemplate.render({a: 25, b: 1});
            const output1 = testTemplate.render({a: 25, b: 2});
            const output2 = testTemplate.render({a: 25, b: 4});
            const output3 = testTemplate.render({a: 25, b: 8});
            const output4 = testTemplate.render({a: 25, b: 16});

            output0.should.equal('25');
            output1.should.equal('27');
            output2.should.equal('29');
            output3.should.equal('25');
            output4.should.equal('25');
        });
    });

    describe('b-xor ->', function () {
        it('should subtract bit if it\'s already set or add it if it\'s not', function () {
            const testTemplate = twig({data: '{{ a b-xor b }}'});
            const output0 = testTemplate.render({a: 25, b: 1});
            const output1 = testTemplate.render({a: 25, b: 2});
            const output2 = testTemplate.render({a: 25, b: 4});
            const output3 = testTemplate.render({a: 25, b: 8});
            const output4 = testTemplate.render({a: 25, b: 16});

            output0.should.equal('24');
            output1.should.equal('27');
            output2.should.equal('29');
            output3.should.equal('17');
            output4.should.equal('9');
        });
    });
});
