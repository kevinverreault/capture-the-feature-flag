/** The showcase's pages, in navigation order. Paths end with a slash, as the static build writes `page/index.html`. */
export const pages = [
  { path: '/', label: 'Home' },
  { path: '/how-it-works/', label: 'How it works' },
  { path: '/quickstart/', label: 'Quickstart' },
  { path: '/guides/sdk/', label: 'SDK and NestJS' },
  { path: '/guides/terraform/', label: 'Terraform' },
  { path: '/roadmap/', label: 'Roadmap' },
] as const;

export const productName = 'Capture The Feature Flag';
