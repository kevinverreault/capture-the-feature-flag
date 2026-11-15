// Command terraform-provider-ctff is the Terraform provider for Capture The Feature Flag (ADR 0004). It manages
// projects, environments and flags through Core's public API.
package main

import (
	"context"
	"flag"
	"log"

	"github.com/hashicorp/terraform-plugin-framework/providerserver"

	"github.com/kevinverreault/capture-the-feature-flag/apps/terraform-provider-ctff/internal/provider"
)

// version is set at build time with -ldflags "-X main.version=…".
var version = "dev"

func main() {
	var debug bool
	flag.BoolVar(&debug, "debug", false, "run the provider with support for debuggers such as delve")
	flag.Parse()

	err := providerserver.Serve(context.Background(), provider.New(version), providerserver.ServeOpts{
		// Nothing is published to a registry; configurations use this address with a dev override or a mirror.
		Address: provider.Address,
		Debug:   debug,
	})
	if err != nil {
		log.Fatal(err)
	}
}
