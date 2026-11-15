// Validates the showcase's Terraform samples (samples/terraform) against the provider built from this repository:
// `terraform init` from a filesystem mirror holding that build, then `terraform validate`, which checks every
// resource and argument against the provider's schema and runs its validators. Part of the `typecheck` target,
// after Nx has built the provider (an implicit dependency). Needs the Terraform CLI on the PATH.
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const samplesDir = fileURLToPath(new URL('../samples/terraform/', import.meta.url));
const providerBinary = fileURLToPath(
  new URL('../../terraform-provider-ctff/dist/terraform-provider-ctff', import.meta.url),
);
const terraform = process.env['TERRAFORM'] ?? 'terraform';

function fail(message: string): never {
  console.error(`validate-terraform-samples: ${message}`);
  process.exit(1);
}

if (!existsSync(providerBinary)) {
  fail(`no provider build at ${providerBinary}. Run \`pnpm nx run @ctff/terraform-provider:build\`.`);
}
if (spawnSync(terraform, ['version'], { stdio: 'ignore' }).error) {
  fail(`the Terraform CLI (${terraform}) isn't on the PATH; install it, or set TERRAFORM to its path.`);
}

const goOses: Record<string, string> = { darwin: 'darwin', linux: 'linux', win32: 'windows' };
const goArches: Record<string, string> = { arm64: 'arm64', x64: 'amd64' };
const goOs = goOses[process.platform];
const goArch = goArches[process.arch];
if (!goOs || !goArch) fail(`unsupported platform ${process.platform}/${process.arch}`);

const sampleFiles = readdirSync(samplesDir).filter((file) => file.endsWith('.tf'));
if (sampleFiles.length === 0) fail(`no .tf files in ${samplesDir}`);

const workDir = mkdtempSync(join(tmpdir(), 'ctff-showcase-tf-'));
try {
  // The layout `terraform init` installs from, as in apps/terraform-provider-ctff/Dockerfile. The version only names
  // the mirror's directory and file, and nothing constrains it; keep it equal to the Dockerfile's PROVIDER_VERSION.
  const version = '0.1.0';
  const pluginDir = join(workDir, 'plugins/registry.terraform.io/kevinverreault/ctff', version, `${goOs}_${goArch}`);
  mkdirSync(pluginDir, { recursive: true });
  const installed = join(pluginDir, `terraform-provider-ctff_v${version}`);
  copyFileSync(providerBinary, installed);
  chmodSync(installed, 0o755);

  const cliConfig = join(workDir, 'terraformrc');
  writeFileSync(
    cliConfig,
    `provider_installation {
  filesystem_mirror {
    path    = ${JSON.stringify(join(workDir, 'plugins'))}
    include = ["registry.terraform.io/kevinverreault/ctff"]
  }
  direct {
    exclude = ["registry.terraform.io/kevinverreault/ctff"]
  }
}
`,
  );

  const configDir = join(workDir, 'config');
  mkdirSync(configDir);
  for (const file of sampleFiles) copyFileSync(join(samplesDir, file), join(configDir, file));

  const env = { ...process.env, TF_CLI_CONFIG_FILE: cliConfig, TF_IN_AUTOMATION: '1', CHECKPOINT_DISABLE: '1' };
  // On a failure, set the exit code rather than exiting, so the `finally` below still removes the working directory.
  const failed = [
    ['init', '-backend=false', '-input=false', '-no-color'],
    ['validate', '-no-color'],
  ].find((args) => {
    const run = spawnSync(terraform, args, { cwd: configDir, env, encoding: 'utf8' });
    if (run.status === 0) return false;
    process.stderr.write(`${run.stdout ?? ''}${run.stderr ?? ''}`);
    return true;
  });
  if (failed) {
    console.error(`validate-terraform-samples: \`terraform ${failed[0]}\` failed for ${sampleFiles.join(', ')}`);
    process.exitCode = 1;
  } else {
    console.log(`validate-terraform-samples: ${sampleFiles.join(', ')} valid against the provider build`);
  }
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
