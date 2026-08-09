# The Twig PHP oracle for the conformance suite.
#
# The image carries PHP and Twig and nothing else. `oracle.php` is mounted from
# the working tree at run time rather than baked in, so editing it needs no
# rebuild. The image changes only when PHP or Twig does — which is exactly when
# expected values can change, so a rebuild is the honest signal that they might.
#
# Pinning both versions here is the point of using a container at all: a
# contributor on one PHP and CI on another would compute different expected
# values for the same case, and that disagreement would surface as a mysterious
# red build rather than as the version difference it is.
#
#   docker build -t twig-oracle test/conformance
#   npm run test:conformance

FROM php:8.4-cli-alpine

# Keep in step with the Twig release the expected values were captured from.
ARG TWIG_VERSION=3.28.0

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

ENV COMPOSER_ALLOW_SUPERUSER=1 COMPOSER_NO_INTERACTION=1

RUN mkdir -p /opt/twig \
    && composer require "twig/twig:${TWIG_VERSION}" \
         --working-dir=/opt/twig \
         --no-progress \
    && composer clear-cache

ENV TWIG_AUTOLOAD=/opt/twig/vendor/autoload.php

WORKDIR /work

ENTRYPOINT ["php", "/work/oracle.php"]
