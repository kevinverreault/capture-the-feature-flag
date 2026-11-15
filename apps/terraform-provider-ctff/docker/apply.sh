#!/bin/sh
# Applies the example configuration to Core, keeping Terraform's state in /state (the working directory).
set -eu

# The configuration is copied in afresh, so a file removed from the example is removed here too.
rm -f /state/*.tf
cp /opt/ctff/example/*.tf /state/

# Core may still be starting: wait until it is ready (compose also waits for its health check).
attempt=0
until wget -q -O /dev/null "${CTFF_BASE_URL%/}/health/ready"; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 60 ]; then
    echo "Core at ${CTFF_BASE_URL} is not ready after 60 attempts" >&2
    exit 1
  fi
  sleep 2
done

terraform init -input=false -no-color
terraform apply -input=false -auto-approve -no-color
