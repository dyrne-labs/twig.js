const Twig = require('..').factory();

const {twig} = Twig;

describe('Twig.js Regression Tests ->', function () {
    it('#47 should not match variables starting with not', function () {
        // Define and save a template
        twig({data: '{% for note in notes %}{{note}}{% endfor %}'}).render({notes: ['a', 'b', 'c']}).should.equal('abc');
    });

    it('#56 functions work inside parentheses', function () {
        // Define and save a template
        Twig.extendFunction('custom', _ => {
            return true;
        });

        twig({data: '{% if (custom("val") and custom("val")) %}out{% endif %}'}).render({}).should.equal('out');
    });

    it('#83 Support for trailing commas in arrays', function () {
        twig({data: '{{ [1,2,3,4,] }}'}).render().should.equal('1,2,3,4');
    });

    it('#83 Support for trailing commas in objects', function () {
        twig({data: '{{ {a:1, b:2, c:3, } }}'}).render();
    });

    it('#283 should support quotes between raw tags', function () {
        twig({data: '{% raw %}\n"\n{% endraw %}'}).render().should.equal('"');
        twig({data: '{% raw %}\n\'\n{% endraw %}'}).render().should.equal('\'');
    });

    it('#737 ternary expression should not override context', function () {
        const str = `{% set classes = ['a', 'b'] %}{% set classes = classes ? classes|merge(['c']) : '' %}{{ dump(classes) }}`;
        const expected = Twig.functions.dump(['a', 'b', 'c']);
        const testTemplate = twig({data: str});
        testTemplate.render().should.equal(expected);
    });

    it('#896 should report a syntax error for an unclosed brace instead of rendering [object Object]', function () {
        // '{{{ ... }}' opens an object with the extra '{' that is never closed.
        // It used to render as '[object Object]' rather than failing.
        (function () {
            twig({rethrow: true, data: 'Hey {{{data.variables.aa | default(\'there\') }}'}).render({data: {variables: {}}});
        }).should.throw(/Expected closing '}'/);

        (function () {
            twig({rethrow: true, data: 'Hey {{{data.variables.aa | default(\'there\') }}}'}).render({data: {variables: {}}});
        }).should.throw(/Expected closing '}'/);
    });

    it('#896 should still render a triple-open brace whose object is closed', function () {
        twig({data: '{% for val in arr %}{{{(val.value):null}|json_encode}}{% endfor %}'})
            .render({arr: [{value: 'one'}, {value: 'two'}]})
            .should.equal('{"one":null}{"two":null}');
    });
});
