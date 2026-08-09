#!/usr/bin/env node

/**
 * Renders every conformance case through both engines and compares the output.
 *
 * Twig PHP runs in a pinned container (see Dockerfile) so that contributors and
 * CI measure against the same engine. Comparison is exact string equality: this
 * suite is about engine semantics, so a leading newline only one engine emits is
 * a real difference worth seeing. Markup-aware comparison belongs in a
 * component-level suite, where the question is whether the DOM matches.
 *
 *   docker build -t twig-oracle test/conformance
 *   npm run test:conformance
 *
 * Usage: node test/conformance/run.mjs [--verbose] [case-name-substring ...]
 */

import {execFileSync} from 'node:child_process';
import {readdirSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const Twig = require('../../src/twig.js').factory();

const here = import.meta.dirname;
const IMAGE = process.env.TWIG_ORACLE_IMAGE ?? 'twig-oracle';

const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const filters = args.filter(arg => !arg.startsWith('-'));

function loadCases() {
    const dir = path.join(here, 'cases');
    const cases = [];

    for (const file of readdirSync(dir).sort()) {
        if (!file.endsWith('.json')) {
            continue;
        }

        const parsed = JSON.parse(readFileSync(path.join(dir, file), 'utf8'));

        for (const testCase of parsed.cases) {
            if (cases.some(existing => existing.name === testCase.name)) {
                throw new Error(`Duplicate case name "${testCase.name}" in ${file}`);
            }

            cases.push(testCase);
        }
    }

    return filters.length ?
        cases.filter(testCase => filters.some(filter => testCase.name.includes(filter))) :
        cases;
}

function renderWithPhp(cases) {
    let output;

    try {
        output = execFileSync('docker', [
            'run', '--rm', '-i',
            '--network', 'none',
            '-v', `${here}:/work:ro`,
            IMAGE
        ], {
            input: JSON.stringify({cases}),
            encoding: 'utf8',
            maxBuffer: 64 * 1024 * 1024
        });
    } catch (error) {
        console.error('Could not run the oracle image.\n');
        console.error('Build it first:\n');
        console.error('  docker build -t twig-oracle test/conformance\n');
        console.error(error.stderr || error.message);
        process.exit(2);
    }

    return JSON.parse(output);
}

/** The JS-side counterpart of `hydrate()` in oracle.php. Keep the two in step. */
function hydrate(value) {
    if (value === null || typeof value !== 'object') {
        return value;
    }

    if (Array.isArray(value)) {
        return value.map(hydrate);
    }

    if (value.__php !== undefined) {
        switch (value.__php) {
            case 'DateTime':
                // Twig PHP reads this as a local-time wall clock, so parsing it
                // as UTC here would shift every rendered date by the offset.
                return new Date(value.value.replace(' ', 'T'));
            case 'object':
                return hydrate(value.value);
            default:
                throw new Error(`Unknown __php tag: ${value.__php}`);
        }
    }

    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, hydrate(entry)]));
}

function renderWithJs(testCase) {
    const options = testCase.options ?? {};

    try {
        const template = Twig.twig({
            data: testCase.template,
            autoescape: options.autoescape ?? false,
            strict_variables: options.strict_variables ?? false,
            // twig.js prints booleans the JavaScript way unless asked not to.
            // This suite measures against PHP, where `true` is '1' and `false`
            // is '', so it opts in — leaving it unset would report a difference
            // the library already knows about and offers a switch for.
            phpStyleBooleans: true,
            rethrow: true
        });

        return template.render(hydrate(testCase.data ?? {}));
    } catch (error) {
        return {error: error.message ?? String(error)};
    }
}

const isError = result => typeof result === 'object' && result !== null && 'error' in result;

/**
 * Renders either engine's result as one comparable string.
 *
 * Rendered output is compared exactly — no trimming, no whitespace collapsing —
 * because a stray newline only one engine emits is a real difference. Errors are
 * compared only on the fact that they happened: the two engines word their
 * messages differently and always will, and asserting on prose would turn every
 * upstream rewording into a failure. What matters is that both refuse.
 */
function normalise(result) {
    return isError(result) ? '<error>' : result;
}

const cases = loadCases();

if (cases.length === 0) {
    console.error(filters.length ? 'No cases matched the filter.' : 'No cases found.');
    process.exit(2);
}

const divergences = JSON.parse(readFileSync(path.join(here, 'divergences.json'), 'utf8'));
const php = renderWithPhp(cases);

const counts = {agree: 0, known: 0, diverge: 0};
const report = [];

const describe = result => (isError(result) ? `<error: ${result.error}>` : JSON.stringify(result));

for (const testCase of cases) {
    const phpResult = php.cases[testCase.name];
    const jsResult = renderWithJs(testCase);

    const fromPhp = normalise(phpResult);
    const fromJs = normalise(jsResult);

    const registered = divergences[testCase.name];
    const equal = fromPhp === fromJs;

    if (equal && registered) {
        // A gap that has closed must be deleted from the registry. Without this
        // the registry silently becomes a graveyard, hiding later regressions
        // behind a reason nobody has revisited.
        counts.diverge++;
        report.push(['diverge', testCase.name, 'agrees now — delete its entry from divergences.json']);
    } else if (equal) {
        counts.agree++;

        if (verbose) {
            report.push(['agree', testCase.name, describe(phpResult)]);
        }
    } else if (registered && registered.js === fromJs) {
        counts.known++;
        report.push(['known', testCase.name, registered.reason]);
    } else {
        counts.diverge++;
        report.push([
            'diverge',
            testCase.name,
            `php=${describe(phpResult)} js=${describe(jsResult)}`
        ]);
    }
}

console.log(`Twig ${php.meta.twig} / PHP ${php.meta.php} via ${IMAGE}\n`);

const width = Math.max(...cases.map(testCase => testCase.name.length));

for (const [status, name, detail] of report) {
    console.log(`${status.toUpperCase().padEnd(8)} ${name.padEnd(width)}  ${detail}`);
}

console.log(
    `\n${counts.agree} agree · ${counts.known} known divergence · ` +
    `${counts.diverge} unexpected (of ${cases.length})`
);

process.exit(counts.diverge === 0 ? 0 : 1);
