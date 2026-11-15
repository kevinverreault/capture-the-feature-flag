/** Every admin page's address in one place; each key is encoded as one path segment. */
const segment = encodeURIComponent;

export const routes = {
  projects: () => '/projects',
  project: (project: string) => `/projects/${segment(project)}`,
  environments: (project: string) => `/projects/${segment(project)}/environments`,
  environment: (project: string, environment: string) =>
    `/projects/${segment(project)}/environments/${segment(environment)}`,
  settings: (project: string) => `/projects/${segment(project)}/settings`,
  /**
   * The Settings page, for every project: telemetry retention, the seen-context cap and the stale-flag threshold.
   * Not to be confused with `settings`, a project's own settings (its name, and deleting it).
   */
  telemetrySettings: () => '/settings',
};
