# Seeds a project through the Terraform provider: `docker compose --profile terraform up` builds the provider,
# then applies the example configuration (examples/birdwatch) to Core and exits. Build from the repository root:
#   docker build -f apps/terraform-provider-ctff/Dockerfile -t ctff-terraform .
# Configuration comes from environment variables: CTFF_BASE_URL (Core's base URL, default http://core:3000).
# Terraform's state is kept in /state, a volume in compose, so applying again only changes what drifted.

FROM golang:1.26-alpine AS build
WORKDIR /src
COPY apps/terraform-provider-ctff/go.mod apps/terraform-provider-ctff/go.sum ./
RUN go mod download
COPY apps/terraform-provider-ctff/ ./
# Laid out as a filesystem mirror, so `terraform init` installs the provider without a registry.
ARG PROVIDER_VERSION=0.1.0
RUN plugin_dir="/out/plugins/registry.terraform.io/kevinverreault/ctff/${PROVIDER_VERSION}/$(go env GOOS)_$(go env GOARCH)" \
 && mkdir -p "$plugin_dir" \
 && CGO_ENABLED=0 go build -trimpath -ldflags "-s -w -X main.version=${PROVIDER_VERSION}" \
      -o "$plugin_dir/terraform-provider-ctff_v${PROVIDER_VERSION}" .

FROM hashicorp/terraform:1.17.2
ENV TF_CLI_CONFIG_FILE=/opt/ctff/terraformrc \
    TF_IN_AUTOMATION=1 \
    CHECKPOINT_DISABLE=1 \
    HOME=/state \
    CTFF_BASE_URL=http://core:3000
# Owned by root and read-only for the runtime user; only /state is written.
COPY --from=build /out/plugins /opt/ctff/plugins
COPY apps/terraform-provider-ctff/docker/terraformrc /opt/ctff/terraformrc
COPY apps/terraform-provider-ctff/docker/apply.sh /opt/ctff/apply.sh
COPY apps/terraform-provider-ctff/examples/birdwatch /opt/ctff/example
RUN mkdir /state && chown 1000:1000 /state
USER 1000:1000
WORKDIR /state
# A one-shot job: it exits once the configuration is applied, so it has no health check.
ENTRYPOINT ["/bin/sh", "/opt/ctff/apply.sh"]
