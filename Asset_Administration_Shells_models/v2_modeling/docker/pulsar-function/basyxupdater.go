package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/apache/pulsar/pulsar-function-go/pf"
)

// The BaSyx URL is read from userConfig.basyxUrl in function-config.yaml.

var httpClient = &http.Client{
	Timeout: 20 * time.Second,
}

type InputMessage struct {
	SubmodelID       string          `json:"submodelId"`
	ElementsToUpdate []ElementUpdate `json:"elementsToUpdate"`
}

type ElementUpdate struct {
	IDShortPath string      `json:"idShortPath"`
	Value       interface{} `json:"value"`
}

func BasyxPatchFunction(ctx context.Context, input []byte) error {
	// 1. Parse Input
	var msg InputMessage
	if err := json.Unmarshal(input, &msg); err != nil {
		fmt.Printf("[ERROR] Failed to unmarshal JSON: %v\n", err)
		return nil
	}

	// 2. Validate Input
	if msg.SubmodelID == "" || len(msg.ElementsToUpdate) == 0 {
		fmt.Printf("[WARN] Invalid input: SubmodelID missing\n")
		return nil
	}

	baseURL := ""
	if fc, ok := pf.FromContext(ctx); ok {
		baseURL, _ = fc.GetUserConfValue("basyxUrl").(string)
	}
	if baseURL == "" {
		return fmt.Errorf("userConfig.basyxUrl is missing in function-config.yaml")
	}
	baseURL = strings.TrimRight(baseURL, "/")

	fmt.Printf("[INFO] Processing SubmodelID: %s (%d elements)\n", msg.SubmodelID, len(msg.ElementsToUpdate))

	hasError := false

	// 3. Process updates
	for _, element := range msg.ElementsToUpdate {
		if element.IDShortPath == "" {
			continue
		}

		if err := updateBasyxElement(baseURL, msg.SubmodelID, element); err != nil {
			fmt.Printf("[ERROR] Update failed '%s': %v\n", element.IDShortPath, err)
			hasError = true
		} else {
			fmt.Printf("[INFO] Updated '%s'\n", element.IDShortPath)
		}
	}

	if hasError {
		return fmt.Errorf("updates failed")
	}
	return nil
}

func updateBasyxElement(baseURL, submodelID string, element ElementUpdate) error {
	payload, err := json.Marshal(element.Value)
	if err != nil {
		return fmt.Errorf("marshal failed: %w", err)
	}

	// BaSyx expects the submodel id base64url-encoded in the path; producers send it as written in the AAS
	encodedID := base64.URLEncoding.EncodeToString([]byte(submodelID))
	url := fmt.Sprintf("%s/submodels/%s/submodel-elements/%s/$value", baseURL, encodedID, element.IDShortPath)
	req, err := http.NewRequest(http.MethodPatch, url, bytes.NewBuffer(payload))
	if err != nil {
		return fmt.Errorf("req create failed: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("api call failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("status %d: %s", resp.StatusCode, string(body))
	}
	return nil
}

func main() {
	fmt.Println("[INFO] Starting BaSyx Updater Function...")
	pf.Start(BasyxPatchFunction)
}
