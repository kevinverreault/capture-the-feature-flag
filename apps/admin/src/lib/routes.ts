import type { Context } from '@ctff/core-api-client';

/** Every admin page's address in one place; each key is encoded as one path segment. */
const segment = encodeURIComponent;

const flagPath = (project: string, flagKey: string) => `/projects/${segment(project)}/flags/${segment(flagKey)}`;

export const routes = {
  projects: () => '/projects',
  /** A project's dashboard, its landing page. */
  project: (project: string) => `/projects/${segment(project)}`,
  environments: (project: string) => `/projects/${segment(project)}/environments`,
  environment: (project: string, environment: string) =>
    `/projects/${segment(project)}/environments/${segment(environment)}`,
  settings: (project: string) => `/projects/${segment(project)}/settings`,
  flags: (project: string) => `/projects/${segment(project)}/flags`,
  /** Outside /flags/, so that no flag key can take its address. */
  newFlag: (project: string) => `/projects/${segment(project)}/new-flag`,
  /** A flag's detail page, opened on the tab of `environment` when given. */
  flag: (project: string, flagKey: string, environment?: string) =>
    environment === undefined
      ? flagPath(project, flagKey)
      : `${flagPath(project, flagKey)}?${new URLSearchParams({ environment }).toString()}`,
  editFlag: (project: string, flagKey: string) => `${flagPath(project, flagKey)}/edit`,
  /** The project's audit log, optionally of one flag only, from the page of older entries at `cursor`. */
  audit: (project: string, { flag, cursor }: { flag?: string; cursor?: number } = {}) => {
    const query = new URLSearchParams();
    if (flag !== undefined) query.set('flag', flag);
    if (cursor !== undefined) query.set('cursor', String(cursor));
    const search = query.toString();
    return `/projects/${segment(project)}/audit${search ? `?${search}` : ''}`;
  },
  /** The context attributes, for every project. */
  contextAttributes: () => '/context-attributes',
  /**
   * The Contexts explorer: the seen contexts of `environment` (whose user_id contains `search`), and what every
   * flag serves `context`. The context is carried by its attributes, named as in contexts (`user_id`, `country`).
   * `shown` is how many seen contexts are listed, when more than the default.
   */
  contexts: (
    project: string,
    {
      environment,
      search,
      context,
      shown,
    }: { environment?: string; search?: string; context?: Context; shown?: number | undefined } = {},
  ) => {
    const query = new URLSearchParams();
    if (environment !== undefined) query.set('environment', environment);
    if (search) query.set('search', search);
    if (context?.user_id !== undefined) query.set('user_id', context.user_id);
    if (context?.country !== undefined) query.set('country', context.country);
    if (shown !== undefined) query.set('shown', String(shown));
    const queryString = query.toString();
    return `/projects/${segment(project)}/contexts${queryString ? `?${queryString}` : ''}`;
  },
  /** The display-name setting, going back to `returnTo` once saved. */
  displayName: (returnTo?: string) =>
    returnTo === undefined ? '/display-name' : `/display-name?${new URLSearchParams({ returnTo }).toString()}`,
  /**
   * The Settings page, for every project: telemetry retention, the seen-context cap and the stale-flag threshold.
   * Not to be confused with `settings`, a project's own settings (its name, and deleting it).
   */
  telemetrySettings: () => '/settings',
};
