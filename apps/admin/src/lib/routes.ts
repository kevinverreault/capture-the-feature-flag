/** Every admin page's address in one place; each key is encoded as one path segment. */
const segment = encodeURIComponent;

const flag = (project: string, flagKey: string) => `/projects/${segment(project)}/flags/${segment(flagKey)}`;

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
      ? flag(project, flagKey)
      : `${flag(project, flagKey)}?${new URLSearchParams({ environment }).toString()}`,
  editFlag: (project: string, flagKey: string) => `${flag(project, flagKey)}/edit`,
};
