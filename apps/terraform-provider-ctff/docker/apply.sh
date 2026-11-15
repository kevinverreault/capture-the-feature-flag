#!/bin/sh
# Applies the example configuration to Core, keeping Terraform's state in the working directory (/state).
set -eu

config_dir="${CONFIG_DIR:-/opt/ctff/example}"
state_dir="${STATE_DIR:-/state}"
adopt_list="${ADOPT_LIST:-/opt/ctff/adopt.txt}"
core_api="${CTFF_BASE_URL%/}/api/v1"
cd "$state_dir"

# The configuration is copied in afresh, so a file removed from the example is removed here too.
rm -f ./*.tf
cp "$config_dir"/*.tf .

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

# Without state, adopt what Core already has (its demo seed creates the Birdwatch project): import blocks for the
# example's resources that exist, so the apply takes them over instead of failing to create them again.
if [ -z "$(terraform state list 2>/dev/null || true)" ]; then
  grep -v -e '^#' -e '^$' "$adopt_list" | while read -r address id; do
    project=${id%%/*}
    case "$address" in
      ctff_project.*) path="/projects/$project" ;;
      ctff_environment.*) path="/projects/$project/environments/${id#*/}" ;;
      ctff_flag.*) path="/projects/$project/flags/${id#*/}" ;;
      ctff_flag_environment.*)
        rest=${id#*/}
        path="/projects/$project/flags/${rest%%/*}/targeting/${rest#*/}"
        ;;
      *) continue ;;
    esac
    if wget -q -O /dev/null "$core_api$path"; then
      printf 'import {\n  to = %s\n  id = "%s"\n}\n\n' "$address" "$id"
    fi
  done > adopt.tf
  if [ -s adopt.tf ]; then
    echo "Adopting what Core already has: $(grep -c '^import' adopt.tf) resources"
  fi
fi

terraform apply -input=false -auto-approve -no-color
