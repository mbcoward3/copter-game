# Copter Game chart

The app owns Deployment, Service, and optional Gateway API HTTPRoute resources.
The platform owns namespaces, Gateways, baseline policies and credentials.
This chart creates no Namespace, RBAC, CRD or NetworkPolicy.

```bash
helm template copter-game charts/copter-game --namespace demo \
  --set image.digest=sha256:$(printf '0%.0s' {1..64}) \
  --set httpRoute.enabled=true \
  --set httpRoute.hostname=copters.matthewcoward.com
```

Every successful main build packages a version `0.<workflow-run>.<attempt>`,
with the exact newly built image digest embedded in values.yaml. CI signs the
image and OCI chart by digest, then promotes the signed chart to the moving
`latest` tag at `oci://ghcr.io/mbcoward3/charts/copter-game`.
Flux follows this chart tag; no CI credentials for the homelab repository are
needed. The image's `latest` tag is for convenience, not used by the chart.

This intentionally trusts successful main builds for unattended deployment.
Signing identifies the publisher; it does not prove a release is bug-free.
A chart signature is not separate Kubernetes image-signature enforcement.

Rollback by pinning the consumer's OCIRepository `spec.ref.digest` to a previous
chart digest instead of `spec.ref.tag: latest`. Leaving latest enabled will
otherwise pick up the next build again. Preserve published version tags and
signatures for rollback; do not delete old artifacts in registry cleanup.

`replicas`, `resources`, `imagePullSecrets` and `httpRoute` are configurable.
Chart and workload images are intended to be public. If made private, configure
Flux source registry credentials separately from workload imagePullSecrets.
