# Conformance suite

Renders the same templates through Twig PHP and twig.js, and compares the output.

Twig PHP is the oracle. `==` compiles straight through to PHP's `==`, most
filters are ports of PHP functions, and Drupal renders these templates with that
engine — so where the two disagree, twig.js is what needs to change.

This suite exists because the divergence that became the `==` fix was found by
hand, by someone porting a component and noticing the DOM had changed. Nothing
in the test suite would have caught it. The first 165 cases here found 15 more.

## Running it

Needs Docker. Nothing else — no PHP, no composer, no Twig checkout.

```sh
docker build -t twig-oracle test/conformance
npm run test:conformance
```

Filter by case name while working on one area, and pass `--verbose` to print the
cases that agree as well as the ones that do not:

```sh
node test/conformance/run.mjs num/         # numbers only
node test/conformance/run.mjs --verbose eq/
```

`npm test` is unaffected: it runs the mocha suite, needs no Docker, and stays the
command to reach for while working on the library itself.

## Why a container

The image pins PHP and Twig together. A contributor on one PHP version and CI on
another would compute *different expected values for the same case*, and that
disagreement would surface as a mysterious red build rather than as the version
difference it is.

It also pins `php.ini`, which turns out to matter: PHP's `precision` setting
controls how floats are stringified, so without a fixed ini `{{ 0.1 + 0.2 }}`
has no stable expected value at all.

`oracle.php` is mounted from the working tree rather than baked into the image,
so editing it needs no rebuild. Rebuild when the `Dockerfile` changes — which is
when PHP or Twig moves, and exactly when expected values can change.

## Adding a case

Cases live in `cases/*.json`, grouped by the kind of thing they exercise. Names
are unique across all files; the runner refuses duplicates.

```json
{
  "name": "eq/null-vs-false",
  "template": "{{ (a == false) ? 'T' : 'F' }}",
  "data": { "a": null },
  "options": { "autoescape": false, "strict_variables": false }
}
```

`data` and `options` are optional. Both engines default to autoescape off and
strict variables off, matching how CivicTheme renders.

Aim cases at seams where the two languages have their own opinions — coercion,
truthiness, number formatting, PHP-derived filters, escaping. A case whose answer
is plain string concatenation on both sides costs maintenance and proves nothing.

JSON cannot express a PHP `DateTime` or object, so those use a tagged form that
both sides understand:

```json
{ "when": { "__php": "DateTime", "value": "2026-01-01 09:30:00" } }
```

Keep that vocabulary small. Every tag is a place where the two harnesses can
drift apart, and each one has to be implemented twice — `hydrate()` in
`oracle.php` and `hydrate()` in `run.mjs`.

## How output is compared

Rendered output is compared as an exact string. No trimming, no whitespace
collapsing, no DOM normalisation: this suite is about engine semantics, and a
stray newline only one engine emits is a real difference worth seeing.

Errors compare only on the fact that they happened. The two engines word their
messages differently and always will, so asserting on the prose would turn every
upstream rewording into a failure. What matters is that both refuse.

## Known divergences

`divergences.json` records where twig.js knowingly differs, with the output it
actually produces and why that is tolerated.

| Result | Meaning | Exit |
| --- | --- | --- |
| agree | Both engines produced the same output | 0 |
| known | Mismatched, and matched its registered entry exactly | 0 |
| diverge | Mismatched with no entry — **or agreed despite having one** | 1 |

That last clause is the point. A registered divergence that starts agreeing
*fails the run*, forcing whoever closed the gap to delete the entry. Without it
the registry silently becomes a graveyard, hiding later regressions behind a
reason nobody has revisited.

Adding an entry is a decision, not a formality. "This is hard to fix" is an issue,
not a divergence.
