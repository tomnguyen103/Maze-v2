# Service-worker fetch timeout tests need browser timers

## Symptom

The bounded IndexedDB wait made the service-worker fetch test return the
network response even though the active Run had a cached account asset.

## What did not work

Adding the timeout race without modelling the browser timer API made the VM
test fail before the IndexedDB state could win the race. The rejected timer
promise was caught by the worker's network fallback, so the failure looked like
cache state had been lost.

## Root cause and fix

The worker intentionally races the mutation/state promise with a 2-second
fallback in `public/sw.js:252-257`. The test VM did not expose `setTimeout`,
although a real service worker does. The sandbox now supplies Node's timer in
`tests/service-worker.test.js:121`, preserving the browser contract while still
testing the network fallback. The migration assertion also includes the
transaction-local tenant predicate at `tests/offline-migration.test.js:88-92`.
