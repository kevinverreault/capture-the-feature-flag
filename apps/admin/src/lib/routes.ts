/** Every admin page's address in one place; each key is encoded as one path segment. */
const segment = encodeURIComponent;

export const routes = {
  projects: () => '/projects',
  project: (project: string) => `/projects/${segment(project)}`,
  environments: (project: string) => `/projects/${segment(project)}/environments`,
  environment: (project: string, environment: string) =>
    `/projects/${segment(project)}/environments/${segment(environment)}`,
  settings: (project: string) => `/projects/${segment(project)}/settings`,
};
