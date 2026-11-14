# The Terraform provider is written in Go

Flags-as-code needs a real Terraform provider (`terraform-provider-ctff`) with proper plan diffs, import and validation. Providers have to be Go binaries built on the Terraform Plugin Framework, so this one deliberately breaks the otherwise all-TypeScript stack. It lives in the monorepo behind an Nx target that wraps `go build`/`go test`, and it talks to Core's public API like any other client.

## Considered Options

- **CDKTF (TypeScript)**: discontinued by HashiCorp, and it produces configuration rather than a provider anyway.
- **Generic `Mastercard/restapi` provider with HCL modules**: no Go code, but weak diffs, no real import, and no schema validation of targeting.
