# Chainguard Custom Assembly Demo — Adding `icu-dev` to a Node Image

This repository demonstrates how to use [Chainguard Custom Assembly](https://edu.chainguard.dev/chainguard/chainguard-images/features/ca-docs/custom-assembly/) to add the `icu-dev` package to a Chainguard Node container image.

## The Problem

Chainguard images are minimal by design — they don't include a package manager and ship only what's needed at runtime. The stock Node image includes ICU **runtime** libraries, but not the **development** artifacts needed to compile native Node addons against ICU.

You can see this for yourself. There's no package manager:

```bash
docker run --rm --entrypoint /sbin/apk cgr.dev/chainguard/node:latest info
```
```
exec: "/sbin/apk": stat /sbin/apk: no such file or directory
```

The ICU runtime libraries exist (Intl works fine):

```bash
docker run --rm --entrypoint /bin/sh cgr.dev/chainguard/node:latest -c "ls /usr/lib/libicu*.so.78"
```
```
/usr/lib/libicudata.so.78
/usr/lib/libicui18n.so.78
/usr/lib/libicuio.so.78
/usr/lib/libicuuc.so.78
```

But the dev headers are completely absent:

```bash
docker run --rm --entrypoint /bin/sh cgr.dev/chainguard/node:latest -c "ls /usr/include/unicode/ 2>/dev/null || echo 'NOT FOUND'"
```
```
NOT FOUND
```

No linker symlinks, so native compilation fails:

```bash
docker run --rm --entrypoint /bin/sh cgr.dev/chainguard/node:latest -c "ls /usr/lib/libicuuc.so 2>/dev/null || echo 'NOT FOUND'"
```
```
NOT FOUND
```

No pkg-config, so build tools can't discover ICU:

```bash
docker run --rm --entrypoint /bin/sh cgr.dev/chainguard/node:latest -c "ls /usr/lib/pkgconfig/icu-uc.pc 2>/dev/null || echo 'NOT FOUND'"
```
```
NOT FOUND
```

**Bottom line:** any native Node addon that compiles against ICU (e.g., `full-icu`, custom `node-gyp` bindings, or packages that link to `libicuuc`) will fail to build in this image. You can't fix this with `apk add` because there's no package manager, and adding a `RUN` layer in a Dockerfile would break the security guarantees.

### Run the probe yourself

The included demo app checks everything in one shot:

```bash
docker build --build-arg NODE_IMAGE=cgr.dev/chainguard/node:latest -t icu-demo .
docker run --rm icu-demo
```

You'll see the runtime checks pass (green) and every dev artifact check fail (red):

```
🔍 Chainguard Custom Assembly — ICU Dev Package Probe

──────────────────────────────────────────────────────────────
  ICU Runtime Libraries (bundled in stock image)
──────────────────────────────────────────────────────────────
  ✅ Found libicuuc.so.78
  ✅ Found libicui18n.so.78
  ✅ Found libicudata.so.78
  ✅ Found libicuio.so.78
  ✅ Intl locale support: 9/9 locales

──────────────────────────────────────────────────────────────
  ICU Development Headers (/usr/include/unicode/)
──────────────────────────────────────────────────────────────
  ❌ Header directory missing: /usr/include/unicode/
  ❌ Cannot compile native addons that depend on ICU

──────────────────────────────────────────────────────────────
  ICU Linker Symlinks (libicu*.so)
──────────────────────────────────────────────────────────────
  ❌ Missing libicuuc.so — linker cannot find ICU
  ❌ Missing libicui18n.so — linker cannot find ICU
  ❌ Missing libicudata.so — linker cannot find ICU
  ❌ Missing libicuio.so — linker cannot find ICU

──────────────────────────────────────────────────────────────
  pkg-config & icu-config
──────────────────────────────────────────────────────────────
  ❌ Missing icu-uc.pc
  ❌ Missing icu-i18n.pc
  ❌ Missing icu-io.pc
  ❌ icu-config not available
  ❌ pkg-config not installed (optional — icu-config and .pc files are present)

  Passed: 5   Failed: 11
  ⚠️  Some dev artifacts are missing.
```

## The Solution: Custom Assembly

Custom Assembly lets you add packages from Chainguard's curated APK repository to a base image — without a package manager, without a Dockerfile `RUN` layer, and without breaking the CVE remediation SLA.

### Repository Structure

```
.
├── ca-overlay/
│   └── node-icu.yaml
├── app/
│   ├── package.json
│   └── index.js
├── Dockerfile
├── .github/
│   └── workflows/
│       └── custom-assembly.yaml
├── scripts/
│   └── verify.sh
└── README.md
```

| File | Purpose |
|---|---|
| `ca-overlay/node-icu.yaml` | Custom Assembly apko overlay config |
| `app/index.js` | Probe app that checks for icu-dev artifacts |
| `Dockerfile` | Consumes the CA-customized image |
| `.github/workflows/custom-assembly.yaml` | GitOps workflow for CI/CD |
| `scripts/verify.sh` | End-to-end verification script |

### Prerequisites

- [chainctl](https://edu.chainguard.dev/chainguard/chainctl/) installed and authenticated
- A Chainguard organization with access to the `node` image
- Docker installed locally
- (Optional) GitHub Actions for GitOps automation

### Step 1: Apply the Custom Assembly overlay

The overlay file at `ca-overlay/node-icu.yaml` tells Custom Assembly to add `icu-dev`:

```yaml
contents:
  packages:
    - icu-dev
```

Apply it with `chainctl` to create a new customized image:

```bash
chainctl image repo build apply \
  -f ca-overlay/node-icu.yaml \
  --parent <YOUR_ORG> \
  --repo node \
  --save-as custom-node-icu \
  --yes
```

> **Note:** `--save-as custom-node-icu` creates a new image rather than modifying the base `node` image, so existing consumers aren't affected.

Check build status:

```bash
chainctl image repo build list --parent <YOUR_ORG> --repo custom-node-icu
```

### Step 2: Run the probe against the customized image

Once the build completes (typically under 20 minutes):

```bash
docker build \
  --build-arg NODE_IMAGE=cgr.dev/<YOUR_ORG>/custom-node-icu:latest \
  -t icu-demo .

docker run --rm icu-demo
```

All 20 checks should now pass — runtime libs, headers, linker symlinks, pkg-config files, and icu-config.

### Step 3: Verify with the script

For a comprehensive end-to-end check:

```bash
./scripts/verify.sh cgr.dev/<YOUR_ORG>/custom-node-icu:latest
```

## GitOps Automation

The included GitHub Actions workflow (`.github/workflows/custom-assembly.yaml`) automates the Custom Assembly build whenever the overlay config changes on `main`.

### Setup

1. **Create a Chainguard assumable identity** for GitHub Actions:

   ```bash
   chainctl iam identities create github-actions-ca \
     --claim=repository=<YOUR_ORG>/<THIS_REPO> \
     --claim=event_name=push
   ```

2. **Grant the identity build permissions** with a custom role that has `repo.update` and `repo.create` permissions.

3. **Set repository variables** in GitHub:

   | Variable | Description | Example |
   |---|---|---|
   | `CHAINGUARD_IDENTITY` | Full identity ID | `<org-id>/<identity-id>` |
   | `CHAINGUARD_ORG` | Chainguard org name | `example.com` |
   | `CHAINGUARD_REPO` | Source image repo | `node` |
   | `CUSTOM_IMAGE` | Full registry path | `cgr.dev/example.com/custom-node-icu` |

4. **Push a change** to `ca-overlay/` on `main` to trigger the workflow.

## How Custom Assembly Works

1. You provide an **apko overlay YAML** specifying packages to add (and optionally env vars, annotations, accounts, or certificates).
2. Chainguard builds the image in a **SLSA Level 2 hardened environment**.
3. The customized image is published to your organization's registry at `cgr.dev/<org>/<image>`.
4. Chainguard **automatically rebuilds** the image when base packages are updated, keeping it patched.
5. The image remains covered under the **CVE remediation SLA** for entitled packages.

## Key Limitations

- You can only **add** packages, not remove base packages from the source image.
- Only packages from images your organization is entitled to can be added.
- Chainguard does not test functional behavior of customized images — you are responsible for testing.

## Resources

- [Custom Assembly Overview](https://edu.chainguard.dev/chainguard/chainguard-images/features/ca-docs/custom-assembly/)
- [Managing CA with chainctl](https://edu.chainguard.dev/chainguard/chainguard-images/features/ca-docs/custom-assembly-chainctl/)
- [GitOps for Custom Assembly](https://edu.chainguard.dev/chainguard/chainguard-images/features/ca-docs/custom-assembly-gitops/)
- [Custom Assembly FAQs](https://edu.chainguard.dev/chainguard/chainguard-images/features/ca-docs/faq/)
- [custom-assembly-as-code demo repo](https://github.com/chainguard-demo/custom-assembly-as-code)
