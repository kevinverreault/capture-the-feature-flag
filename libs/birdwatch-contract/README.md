# @ctff/birdwatch-contract

What the two Birdwatch apps, [birdwatch-api](../../apps/birdwatch-api/README.md) and [birdwatch-web](../../apps/birdwatch-web/README.md), agree on, so a change to one that breaks the other fails `typecheck`:

- the response shapes of birdwatch-api's routes (`FeedResponse`, `SpeciesResponse`, …), with the flags as the SDK's `AllFlags`,
- `sightingLimits`: what a new sighting may hold, which the API checks and the website's form shows up front,
- `birdwatchFlags`: the demo's flag keys, as Core's demo seed creates them.
