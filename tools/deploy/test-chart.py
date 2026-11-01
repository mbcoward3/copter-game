#!/usr/bin/env python3
"""Offline Helm rendering/security contract. Requires helm and PyYAML."""
from pathlib import Path
import subprocess
import unittest

import yaml

ROOT = Path(__file__).resolve().parents[2]
CHART = ROOT / "charts/copter-game"
DIGEST = "sha256:" + "a" * 64


def render(*values, success=True):
    command = ["helm", "template", "copter-game", str(CHART), "--namespace", "demo"]
    for value in values:
        command += ["--set", value]
    result = subprocess.run(command, capture_output=True, text=True)
    if success and result.returncode:
        raise AssertionError(result.stderr)
    if not success:
        if result.returncode == 0:
            raise AssertionError("invalid configuration unexpectedly rendered")
        return []
    return [doc for doc in yaml.safe_load_all(result.stdout) if doc]


class ChartContract(unittest.TestCase):
    def test_requires_immutable_image(self):
        render(success=False)
        render("image.digest=latest", success=False)
        render("image.digest=sha256:bad", success=False)
        render(f"image.digest={DIGEST}", "replicas=0", success=False)

    def test_default_resources_and_security(self):
        docs = render(f"image.digest={DIGEST}")
        self.assertEqual({d["kind"] for d in docs}, {"Deployment", "Service"})
        deployment = next(d for d in docs if d["kind"] == "Deployment")
        spec = deployment["spec"]["template"]["spec"]
        self.assertFalse(spec["automountServiceAccountToken"])
        self.assertTrue(spec["securityContext"]["runAsNonRoot"])
        self.assertEqual(spec["securityContext"]["seccompProfile"]["type"], "RuntimeDefault")
        container = spec["containers"][0]
        self.assertEqual(container["image"], f"ghcr.io/mbcoward3/copter-game@{DIGEST}")
        self.assertFalse(container["securityContext"]["allowPrivilegeEscalation"])
        self.assertTrue(container["securityContext"]["readOnlyRootFilesystem"])
        self.assertEqual(container["securityContext"]["capabilities"]["drop"], ["ALL"])
        self.assertEqual(container["ports"][0]["containerPort"], 8080)
        self.assertIn("readinessProbe", container)
        self.assertIn("livenessProbe", container)
        self.assertEqual(deployment["spec"]["selector"]["matchLabels"],
                         {"app.kubernetes.io/name": "copter-game"})
        self.assertEqual({v["name"] for v in spec["volumes"]}, {"nginx-cache", "nginx-run", "tmp"})
        service = next(d for d in docs if d["kind"] == "Service")
        self.assertEqual(service["spec"]["ports"][0]["port"], 80)

    def test_route_and_values(self):
        render(f"image.digest={DIGEST}", "httpRoute.enabled=true", success=False)
        docs = render(f"image.digest={DIGEST}", "httpRoute.enabled=true",
                      "httpRoute.hostname=copters.matthewcoward.com", "replicas=2",
                      "resources.limits.memory=256Mi")
        self.assertEqual({d["kind"] for d in docs}, {"Deployment", "Service", "HTTPRoute"})
        route = next(d for d in docs if d["kind"] == "HTTPRoute")
        self.assertEqual(route["spec"]["hostnames"], ["copters.matthewcoward.com"])
        self.assertEqual(route["spec"]["parentRefs"][0]["namespace"], "gateway-system")
        self.assertEqual(route["spec"]["rules"][0]["backendRefs"], [{"name": "copter-game", "port": 80}])
        deployment = next(d for d in docs if d["kind"] == "Deployment")
        self.assertEqual(deployment["spec"]["replicas"], 2)
        self.assertEqual(deployment["spec"]["template"]["spec"]["containers"][0]["resources"]["limits"]["memory"], "256Mi")

    def test_lint(self):
        subprocess.run(["helm", "lint", str(CHART), "--strict", "--set", f"image.digest={DIGEST}"], check=True)


if __name__ == "__main__":
    unittest.main()
