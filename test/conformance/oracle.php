<?php

/**
 * @file
 * Renders conformance cases through Twig PHP and reports what it produced.
 *
 * This is the oracle: twig.js is the implementation under test, and Twig PHP is
 * the answer it is measured against. `==` compiles straight through to PHP's
 * `==`, filters are ports of PHP functions, and Drupal renders these templates
 * with this engine — so where the two disagree, this side is the specification.
 *
 * Reads  {"cases": [{name, template, data, options}, ...]}  as JSON on stdin.
 * Writes {"meta": {...}, "cases": {name: html | {"error": msg}}} on stdout.
 *
 * Errors are captured rather than thrown, so a template Twig PHP refuses is a
 * comparable result instead of a crash: twig.js should refuse it too, and the
 * suite can say so.
 */

declare(strict_types=1);

$autoload = getenv('TWIG_AUTOLOAD') ?: '/opt/twig/vendor/autoload.php';

if (!is_file($autoload)) {
    fwrite(STDERR, "Twig autoloader not found at {$autoload}.\n");
    fwrite(STDERR, "This script expects to run inside the conformance image.\n");
    exit(2);
}

require $autoload;

/**
 * Rebuilds values JSON cannot carry, from a tagged form both engines understand.
 *
 * Keep this vocabulary small. Every tag is a place where the two harnesses can
 * drift apart, so a case that needs a new one is worth a second look first.
 */
function hydrate(mixed $value): mixed
{
    if (!is_array($value)) {
        return $value;
    }

    if (isset($value['__php'])) {
        return match ($value['__php']) {
            'DateTime' => new \DateTimeImmutable($value['value']),
            'object' => (object) array_map(hydrate(...), $value['value']),
            default => throw new \RuntimeException('Unknown __php tag: ' . $value['__php']),
        };
    }

    return array_map(hydrate(...), $value);
}

$input = json_decode((string) file_get_contents('php://stdin'), true);

if (!is_array($input) || !isset($input['cases'])) {
    fwrite(STDERR, "Expected {\"cases\": [...]} as JSON on stdin.\n");
    exit(2);
}

$out = [];

foreach ($input['cases'] as $case) {
    $options = $case['options'] ?? [];

    // A fresh environment per case: options vary case by case, and a shared
    // instance would leak the previous case's autoescape setting into this one.
    $twig = new \Twig\Environment(new \Twig\Loader\ArrayLoader([]), [
        'autoescape' => $options['autoescape'] ?? false,
        'strict_variables' => $options['strict_variables'] ?? false,
        'cache' => false,
    ]);

    try {
        $out[$case['name']] = $twig
            ->createTemplate($case['template'], $case['name'])
            ->render(hydrate($case['data'] ?? []));
    } catch (\Throwable $error) {
        $out[$case['name']] = ['error' => $error->getMessage()];
    }
}

// The versions travel with the results: they are how a reader tells "twig.js
// regressed" from "the pinned Twig moved" when a red run appears.
echo json_encode([
    'meta' => [
        'twig' => \Twig\Environment::VERSION,
        'php' => PHP_VERSION,
    ],
    'cases' => $out,
], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
