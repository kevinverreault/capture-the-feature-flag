/** A page of the showcase: its path, its label in the navigation, and its group in the footer. */
export interface SitePage {
  /** Ends with a slash, as the static build writes `page/index.html`. */
  path: string;
  text: string;
  group: 'Product' | 'Guides';
}

/** The showcase's pages, in navigation order. */
export const pages: readonly SitePage[] = [
  { path: '/', text: 'Home', group: 'Product' },
  { path: '/how-it-works/', text: 'How it works', group: 'Product' },
  { path: '/quickstart/', text: 'Quickstart', group: 'Product' },
  { path: '/guides/sdk/', text: 'SDK and NestJS', group: 'Guides' },
  { path: '/guides/terraform/', text: 'Terraform', group: 'Guides' },
  { path: '/roadmap/', text: 'Roadmap', group: 'Product' },
];

export const productName = 'Capture The Feature Flag';
