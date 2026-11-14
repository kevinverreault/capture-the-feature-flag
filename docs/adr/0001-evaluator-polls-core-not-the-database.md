# Evaluators poll Core for targeting snapshots; they never touch the database

Core owns the database schema, and Evaluators must scale independently. So Evaluators hold no database connection. Each one polls Core's API every few seconds for a full targeting snapshot per environment, using ETag/`If-None-Match` so unchanged snapshots cost nothing, and evaluates from memory. Evaluation counts and seen contexts flow the other way: Evaluators add them up and send them to Core periodically.

## Considered Options

- **Evaluator reads the database directly (read-only)**: lower latency to see changes, but it couples Evaluators to Core's schema and adds a database connection for every replica.
- **Core pushes changes (SSE or message bus)**: faster propagation, but needs a message bus or long-lived connections in V1. It can be added later without changing the snapshot shape.

## Consequences

A targeting change takes up to one poll interval to reach every Evaluator. Evaluation telemetry is lost if an Evaluator crashes between flushes, which is acceptable for dashboard metrics.
