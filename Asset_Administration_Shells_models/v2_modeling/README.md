# Digital Twin Architecture

Eclipse BaSyx, PSS-PASS-broker and Apache Pulsar used in a demo factory packaging line.

```
device ──MQTT──► mosquitto ──► pss-pass-broker ──► Pulsar ──► basyxupdater ──► BaSyx ──► MongoDB
```

1. [Files](#files)
2. [Requirements](#requirements)
3. [Usage](#usage)
4. [Endpoints](#endpoints)
5. [Sending data](#sending-data)
6. [Reading data](#reading-data)
   - [Rules](#rules)
   - [Common requests](#common-requests)
   - [Ids](#ids)
   - [Examples](#examples)
7. [Troubleshooting](#troubleshooting)
8. [Changing things](#changing-things)
9. [Notes](#notes)

## Files

| Path | Purpose |
|---|---|
| `docker-compose.yaml` | The stack |
| `docker/aas/` | The 9 AAS loaded into BaSyx |
| `docker/broker/config.yaml` | Broker configuration (MQTT → Pulsar) |
| `docker/mosquitto/mosquitto.conf` | MQTT broker configuration |
| `docker/pulsar/client.conf` | `pulsar-admin` configuration inside the `broker` container |
| `docker/pulsar-function/` | `basyxupdater` Pulsar Function: source, Go modules, function configuration |

## Usage

```
docker compose up -d --build   # start; the first run takes a few minutes
docker compose ps -a           # services "Up", one-shot jobs "Exited (0)"
docker compose down            # stop, data is kept
docker compose down -v         # stop and delete all data
```

Three one-shot jobs run at every start:

| Job | What it does |
|---|---|
| `pulsar-init` | Creates the Pulsar cluster metadata (first start only) |
| `pulsar-function` | Builds and deploys `basyxupdater`. Done when it logs `basyxupdater is running` |
| `discovery-init` | Registers the asset ids of every AAS in the repository in Discovery |

## Endpoints

| Service | Host | Inside the network |
|---|---|---|
| AAS Web UI | http://localhost:3000 | |
| AAS Environment | http://localhost:8081 | `aas-env:8081` |
| AAS Registry | http://localhost:8082 | `aas-registry:8080` |
| Submodel Registry | http://localhost:8083 | `sm-registry:8080` |
| AAS Discovery | http://localhost:8084 | `aas-discovery:8081` |
| MQTT | `localhost:1883` | `mosquitto:1883` |
| Pulsar | http://localhost:9553, `pulsar://localhost:6650` | `broker:9553`, `broker:6650` |
| Dekaf (Pulsar UI) | http://localhost:8090 | |
| MongoDB | not exposed | `mongo:27017` |

## Sending data

The broker subscribes to `factory-b/phase3/#` and forwards each MQTT topic to a Pulsar topic, with `/` replaced by `-`. `basyxupdater` reads these topics and writes the values to BaSyx.

| Asset | MQTT topic |
|---|---|
| Package Loader | `factory-b/phase3/package-loader` |
| Pallet Loader | `factory-b/phase3/pallet-loader` |
| COMAU robot | `factory-b/phase3/robot` |
| Balluff camera | `factory-b/phase3/camera` |
| Labeler | `factory-b/phase3/labeler` |
| Smartwatch | `factory-b/phase3/smartwatch` |
| Line, scrap area | `factory-b/phase3/line/scrap-area` |
| Line, pick area | `factory-b/phase3/line/pick-area` |

Payload:

```json
{
  "submodelId": "urn:factory-b:phase3:submodel:robot",
  "elementsToUpdate": [
    {"idShortPath": "RobotSpeed", "value": "55"},
    {"idShortPath": "ProcessEventLog.Activity", "value": "picking"}
  ]
}
```

`idShortPath` joins nested elements with `.`.

Test from bash or PowerShell 7:

```
docker compose exec mosquitto mosquitto_pub -t factory-b/phase3/robot -m '{"submodelId":"urn:factory-b:phase3:submodel:robot","elementsToUpdate":[{"idShortPath":"RobotSpeed","value":"55"}]}'
```

`RobotSpeed` in the robot's `OperationalData` submodel then shows `55`.

## Reading data

All data is available through the BaSyx REST API (AAS API v3), at `http://localhost:8081` for AAS and submodels and `http://localhost:8084` for lookup by asset id. No authentication is needed.

### Rules

1. **Encode ids in URLs as base64url**, without `=` padding. For example, `urn:factory-b:phase3:submodel:robot` becomes `dXJuOmZhY3RvcnktYjpwaGFzZTM6c3VibW9kZWw6cm9ib3Q`.
2. **Use `$value` for plain values** and omit it for the full model, which adds types, semantic ids and descriptions.
3. **Join nested elements with `.`** in `idShortPath`, e.g. `ProcessEventLog.Activity`. Address list items with `[n]`.
4. **Values are returned as JSON strings**, e.g. `"55"`. The element's `valueType` (in the full model) gives the type, e.g. `xs:integer`.
5. **`null` means no value has been received yet.** Values appear once data arrives over MQTT.
6. **Lists are paged.** Use `limit`, and pass `paging_metadata.cursor` from the response as `cursor` to get the next page.
7. **Quote URLs that contain `$value`** in single quotes in bash, or escape it as `` `$value `` in PowerShell double-quoted strings.
8. **Read only.** Consumers should only send `GET` requests. Values are written by the data pipeline.

Encoding an id:

| Shell | Command |
|---|---|
| bash | `printf '%s' 'urn:factory-b:phase3:submodel:robot' \| base64 -w0 \| tr '+/' '-_' \| tr -d '='` |
| PowerShell | `[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes('urn:factory-b:phase3:submodel:robot')).TrimEnd('=').Replace('+','-').Replace('/','_')` |
| Python | `base64.urlsafe_b64encode(id.encode()).decode().rstrip("=")` |

### Common requests

| Goal | Request |
|---|---|
| List all AAS | `GET :8081/shells` |
| Find an AAS by name | `GET :8081/shells?idShort=RobotComau` |
| Find the AAS of a physical asset | `GET :8084/lookup/shells?assetIds={b64 of {"name":"serialNumber","value":"CR-2025-118734"}}` (also works with `globalAssetId`) |
| Get one AAS | `GET :8081/shells/{b64 AAS id}` |
| List the submodels of an AAS | `GET :8081/shells/{b64 AAS id}/submodel-refs` |
| Get the live values of a machine | `GET :8081/submodels/{b64 submodel id}/$value` |
| Get one value | `GET :8081/submodels/{b64 submodel id}/submodel-elements/RobotSpeed/$value` |
| Get one element with its type | `GET :8081/submodels/{b64 submodel id}/submodel-elements/RobotSpeed` |
| Get a submodel without its content | `GET :8081/submodels/{b64 submodel id}/$metadata` |
| Find all submodels of a kind | `GET :8081/submodels?semanticId={b64 semantic id}` |

### Ids

| Asset | AAS id | Serial number | Live data submodel id |
|---|---|---|---|
| Packaging line | `urn:factory-b:phase3:packaging-line` | `PL3-2026-0001` | `urn:factory-b:phase3:submodel:pick-area`, `urn:factory-b:phase3:submodel:scrap-area` |
| Package Loader | `urn:factory-b:phase3:package-loader` | `PKL-2026-0412` | `urn:factory-b:phase3:submodel:load-package` |
| Pallet Loader | `urn:factory-b:phase3:pallet-loader` | `PAL-2026-0413` | `urn:factory-b:phase3:submodel:pallet-loader` |
| COMAU robot | `https://eng.it/shells/CMU/R3` | `CR-2025-118734` | `urn:factory-b:phase3:submodel:robot` |
| Balluff camera | `https://eng.it/shells/BA/002T` | `BVS-2025-004561` | `urn:factory-b:phase3:submodel:camera` |
| Labeler | `urn:factory-b:phase3:labeler` | `ALX926-2510-0387` | `urn:factory-b:phase3:submodel:labeler` |
| Smartwatch | `urn:factory-b:phase3:smartwatch` | `WS50-2026-0042` | `urn:factory-b:phase3:submodel:smartwatch` |
| Eclipse BaSyx | `urn:factory-b:phase3:basyx` | | |
| PSS-PASS-broker | `urn:factory-b:phase3:pss-pass-broker` | | |

Each device also has the static submodels `Nameplate`, `TechnicalData`, `HandoverDocumentation`, `ContactInformations` and `AssetInterfacesDescription`. Their ids are listed by `submodel-refs`.

### Examples

bash:

```
curl 'http://localhost:8081/submodels/dXJuOmZhY3RvcnktYjpwaGFzZTM6c3VibW9kZWw6cm9ib3Q/$value'
```

PowerShell:

```powershell
function B64([string]$s) { [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($s)).TrimEnd('=').Replace('+','-').Replace('/','_') }
$sm = B64 'urn:factory-b:phase3:submodel:robot'
Invoke-RestMethod "http://localhost:8081/submodels/$sm/`$value"
```

Python:

```python
import base64, json, urllib.request

BASYX = "http://localhost:8081"
DISCOVERY = "http://localhost:8084"


def b64(text):
    return base64.urlsafe_b64encode(text.encode()).decode().rstrip("=")


def get(url):
    with urllib.request.urlopen(url) as r:
        return json.load(r)


# AAS id of the robot, found by its serial number
asset = json.dumps({"name": "serialNumber", "value": "CR-2025-118734"})
aas_id = get(f"{DISCOVERY}/lookup/shells?assetIds={b64(asset)}")["result"][0]

# Submodel ids of that AAS
refs = get(f"{BASYX}/shells/{b64(aas_id)}/submodel-refs")["result"]
submodel_ids = [r["keys"][0]["value"] for r in refs]

# Live values of the robot
values = get(f"{BASYX}/submodels/{b64('urn:factory-b:phase3:submodel:robot')}/$value")
print(values["RobotSpeed"], values["ProcessEventLog"]["Activity"])
```

The full API is described in the specification at https://github.com/admin-shell-io/aas-specs-api.

## Troubleshooting

| Check | Command |
|---|---|
| Broker forwarded the message | `docker compose logs pss-pass-broker` |
| Message reached Pulsar | Dekaf → `public/default` → topic |
| Function status | `docker compose exec broker bin/pulsar-admin functions status --tenant public --namespace default --name basyxupdater` |
| Function output | `docker compose logs broker` (lines `[INFO] Updated '...'`) |

## Changing things

| Change | Edit | Apply |
|---|---|---|
| An AAS | `docker/aas/*.json`, and raise `administration.revision` of every submodel you change | `docker compose restart aas-env` |
| Broker topics or sources | `docker/broker/config.yaml` | `docker compose restart pss-pass-broker` |
| Function topics | `docker/pulsar-function/function-config.yaml` | `docker compose up -d --build pulsar-function` |
| Function code | `docker/pulsar-function/basyxupdater.go` | `docker compose up -d --build pulsar-function` |
| Broker version | commit in the `pss-pass-broker` build URL in `docker-compose.yaml` | `docker compose up -d --build` |

## Notes

- **Persistence.** BaSyx data, including the values written at runtime, is stored in MongoDB and survives restarts.
- **How models load.** At startup BaSyx loads `docker/aas/`:
  - A stored AAS or submodel is replaced only when the file has a higher version or revision.
  - A file removed from the folder is not removed from BaSyx.
  - `docker compose down -v` starts from the files again.
- **Registry entries after an update.** When a submodel is replaced, its registry entry keeps the old version and revision.
- **Function restarts.** `basyxupdater` is re-created at every start and reads only new messages.
- **`basyxupdater` source.** It is the upstream version from pss-pass-broker `c67d76d`, without the InfluxDB logging.
- **Hostnames.** `mosquitto` and `broker` resolve only inside the Docker network:
  - Devices outside Docker connect to `<host>:1883`.
  - A Pulsar client on the host needs the hosts entry `127.0.0.1 broker`.
- **Other machines.** The Web UI and BaSyx use `localhost` URLs. For access from another machine, replace `localhost` in the `aas-web-ui` environment and in `BASYX_EXTERNALURL`.
- **Security.** None; this setup is for development:
  - MQTT and Pulsar have no authentication.
  - MongoDB uses demo credentials.
  - CORS allows every origin.
- **OPC UA.** It is disabled. To use it, enable it in `docker/broker/config.yaml` and add an `opcua` → `pulsar` pipeline.
