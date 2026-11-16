# AVANT Node-RED Helm chart

Deploys the two services from the supplied Compose file:

- Node-RED (`nodered/node-red:latest`), port 1880, timezone `Europe/Amsterdam`
- Speed Prediction (`ghcr.io/emiliocimino/autopilotmlservice:v0.1.1`), port 8010

## Important: scenario data

Compose mounts `./nodered_data` into `/data`. This chart instead creates a PVC and mounts it at `/data`.

**A new PVC starts empty.** The chart does not yet copy your local `nodered_data` directory into the claim. To preserve the scenario, you must provide the directory contents and choose a seeding method (for example, package the files into an initialization image/init container, or pre-populate the PVC). Do not assume the scenario is present after the first install.

If the PVC already exists, set `nodeRed.persistence.existingClaim` in a values override. The chart expects the claim to be in the same namespace as the release.

## Install

```bash
helm lint ./avant-node-red-helm
helm template demo ./avant-node-red-helm --namespace avant-demo
helm install demo ./avant-node-red-helm --namespace avant-demo --create-namespace
```

To reach Node-RED without an Ingress:

```bash
kubectl -n avant-demo port-forward svc/demo-avant-node-red-node-red 1880:1880
```

Then open `http://localhost:1880`.

The Speed Prediction service is internal to the cluster. From Node-RED, use:

```text
http://demo-avant-node-red-speed-prediction:8010
```



