declare namespace App {
  interface Locals {
    /** The origin of the Core this admin app calls, set by the host (see host.js) or from CORE_URL. */
    coreBaseUrl: string;
  }
}
