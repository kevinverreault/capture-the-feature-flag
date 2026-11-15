/** Every admin page's address in one place; each key is encoded as one path segment. */
const segment = encodeURIComponent;

const flagPath = (project: string, flagKey: string) => `/projects/${segment(project)}/flags/${segment(flagKey)}`;

export const routes = {
  projects: () => '/projects',
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
  /**
   * The Settings page, for every project: telemetry retention, the seen-context cap and the stale-flag threshold.
   * Not to be confused with `settings`, a project's own settings (its name, and deleting it).
   */
  telemetrySettings: () => '/settings',
};
