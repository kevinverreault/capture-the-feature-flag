# Capture The Feature Flag

A feature flag platform that an organization or individual deploys and operates for their own use. It decides, per request, which variation of a flag a given context receives.

## Language

### Ownership

**Operator**:
The organization or individual who deploys and runs an install of Capture The Feature Flag. There is exactly one per install.
_Avoid_: Tenant, customer, account, organization

**Project**:
A group of flags belonging to one application or product, with its own environments.
_Avoid_: App, workspace

**Environment**:
A named stage within a project (e.g. `development`, `production`) in which each flag has its own targeting.
_Avoid_: Stage, tier

**SDK key**:
The opaque, generated identifier an SDK uses to say which environment it is evaluating in. In V1 it identifies but doesn't authenticate.
_Avoid_: API key, token, environment id

### Flags

**Flag**:
A named decision point defined once per project, whose served variation is controlled independently in each environment.
_Avoid_: Toggle, switch, feature

**Flag key**:
The immutable, kebab-case identifier of a flag within its project (e.g. `rare-bird-alerts`).
_Avoid_: Flag name, flag id

**Variation**:
One of the possible values a flag can serve. A boolean flag has exactly two: `true` and `false`.
_Avoid_: Value, option, treatment

**Archived flag**:
A flag that has been retired: hidden from the flag list and never served, but still recoverable until permanently deleted.
_Avoid_: Deleted flag, disabled flag

### Targeting

**Targeting**:
The configuration of one flag in one environment: whether targeting is on, its individual targets, its rules, its default variation and its off variation.
_Avoid_: Flag config, flag settings, flag environment

**Targeting on / off**:
The per-environment switch on a flag. When off, everyone gets the off variation. When on, the individual targets, rules and default variation decide.
_Avoid_: Enabled/disabled (that's a variation, not the switch)

**Off variation**:
The variation served to every context while targeting is off.

**Individual target**:
A list of user IDs that are always served one specific variation while targeting is on.
_Avoid_: Whitelist, allowlist, user override

**Rule**:
An ordered condition on a context attribute (e.g. `country in [CA, US]`) that serves a variation when it matches. The first rule that matches wins.
_Avoid_: Filter, condition, segment

**Default variation**:
The variation served when targeting is on and no individual target or rule matches.
_Avoid_: Fallthrough, fallback value

### Context

**Context**:
The description of whoever a flag is being evaluated for, made of context attributes (in V1, `user_id` and `country`).
_Avoid_: User, subject, identity

**Context attribute**:
A named, typed field of a context that rules can test. Built-in attributes (`user_id`, `country`) cannot be edited.
_Avoid_: Property, trait, claim

**Seen context**:
A context that has recently been evaluated in an environment. It is recorded so an admin can inspect what each flag serves to it.

### Evaluation

**Evaluation**:
Working out which variation one flag serves to one context in one environment.
_Avoid_: Resolution, check, lookup

**Evaluation reason**:
Why an evaluation produced its variation: targeting off, individual target, rule match, default variation, flag not found, or error.

**Fallback value**:
The value the calling code supplies to the SDK, returned when an evaluation can't happen (flag unknown or archived, Evaluator unreachable).
_Avoid_: Default value (confusable with default variation)

**Evaluation count**:
How many evaluations of one flag served one variation in one environment within one minute (a 1-minute bucket). Evaluators add them up and send them to Core.
_Avoid_: Hit, impression

**Stale flag**:
A flag that has had no evaluations in any environment for a set number of days. That number is the **stale-flag threshold**.

**Retention**:
How long Core keeps evaluation counts (metric retention) and seen contexts after they were last seen (seen-context retention), before deleting them.

**Seen-context cap**:
How many seen contexts Core keeps per environment: the most recently seen.

**Settings**:
The install-wide values an admin sets for telemetry: the retention, the seen-context cap and the stale-flag threshold. Not to be confused with a project's own settings (its name).

### Change history

**Audit entry**:
A record of one change to a project, environment, flag or targeting: who made it, when, and what changed.
_Avoid_: Log, event, history item

### System parts

**Core**:
The service that owns all admin data and its schema, and exposes the API used by the admin app, Terraform and Evaluators.
_Avoid_: Backend, API server

**Evaluator**:
The horizontally scalable service that answers evaluation requests from an in-memory copy of the targeting it gets from Core.
_Avoid_: Edge, relay, flag server
