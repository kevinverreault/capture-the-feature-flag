// Package client is a small HTTP client for Core's public /api/v1, covering what the provider manages.
package client

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// Actor is sent in the X-CTFF-Actor header of every request, so Core attributes the changes to Terraform.
const Actor = "terraform"

// ManagedBy is the "managed by" marker the provider sets on the flags it manages.
const ManagedBy = "terraform"

// Client calls Core's API at a base URL such as http://localhost:3000.
type Client struct {
	apiURL    string
	http      *http.Client
	userAgent string
}

// New returns a client for the Core at baseURL (without the /api/v1 prefix).
func New(baseURL, userAgent string) (*Client, error) {
	parsed, err := url.Parse(baseURL)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
		return nil, fmt.Errorf("base URL %q must be an absolute http(s) URL, such as http://localhost:3000", baseURL)
	}
	return &Client{
		apiURL:    strings.TrimRight(baseURL, "/") + "/api/v1",
		http:      &http.Client{Timeout: 30 * time.Second},
		userAgent: userAgent,
	}, nil
}

// APIError is a response from Core with an error status.
type APIError struct {
	Method  string
	Path    string
	Status  int
	Message string
}

func (e *APIError) Error() string {
	return fmt.Sprintf("%s %s: %d %s: %s", e.Method, e.Path, e.Status, http.StatusText(e.Status), e.Message)
}

// IsNotFound reports whether err is Core answering 404.
func IsNotFound(err error) bool {
	var apiErr *APIError
	return errors.As(err, &apiErr) && apiErr.Status == http.StatusNotFound
}

// IsConflict reports whether err is Core answering 409 (a key already in use, or a stale version).
func IsConflict(err error) bool {
	var apiErr *APIError
	return errors.As(err, &apiErr) && apiErr.Status == http.StatusConflict
}

// Project is a project as Core returns it.
type Project struct {
	Key  string `json:"key"`
	Name string `json:"name"`
}

// Environment is an environment as Core returns it.
type Environment struct {
	ProjectKey string `json:"projectKey"`
	Key        string `json:"key"`
	Name       string `json:"name"`
	SDKKey     string `json:"sdkKey"`
}

// Flag is a flag as Core returns it.
type Flag struct {
	ProjectKey  string   `json:"projectKey"`
	Key         string   `json:"key"`
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Tags        []string `json:"tags"`
	Version     int64    `json:"version"`
	ManagedBy   *string  `json:"managedBy"`
}

// FlagInput is the editable part of a flag.
type FlagInput struct {
	Name        string
	Description string
	Tags        []string
	// ManagedBy is the "managed by" marker to set; empty leaves it as it is (unset on a new flag).
	ManagedBy string
}

func (input FlagInput) body() map[string]any {
	tags := input.Tags
	if tags == nil {
		tags = []string{}
	}
	body := map[string]any{"name": input.Name, "description": input.Description, "tags": tags}
	if input.ManagedBy != "" {
		body["managedBy"] = input.ManagedBy
	}
	return body
}

func (c *Client) GetProject(ctx context.Context, key string) (*Project, error) {
	var out Project
	return &out, c.do(ctx, http.MethodGet, projectPath(key), nil, &out)
}

func (c *Client) CreateProject(ctx context.Context, key, name string) (*Project, error) {
	var out Project
	return &out, c.do(ctx, http.MethodPost, "/projects", map[string]any{"key": key, "name": name}, &out)
}

func (c *Client) UpdateProject(ctx context.Context, key, name string) (*Project, error) {
	var out Project
	return &out, c.do(ctx, http.MethodPatch, projectPath(key), map[string]any{"name": name}, &out)
}

// DeleteProject deletes the project with its environments, flags and targeting.
func (c *Client) DeleteProject(ctx context.Context, key string) error {
	return c.do(ctx, http.MethodDelete, projectPath(key), nil, nil)
}

func (c *Client) GetEnvironment(ctx context.Context, projectKey, key string) (*Environment, error) {
	var out Environment
	return &out, c.do(ctx, http.MethodGet, environmentPath(projectKey, key), nil, &out)
}

// CreateEnvironment creates the environment; Core generates its SDK key.
func (c *Client) CreateEnvironment(ctx context.Context, projectKey, key, name string) (*Environment, error) {
	var out Environment
	body := map[string]any{"key": key, "name": name}
	return &out, c.do(ctx, http.MethodPost, projectPath(projectKey)+"/environments", body, &out)
}

func (c *Client) UpdateEnvironment(ctx context.Context, projectKey, key, name string) (*Environment, error) {
	var out Environment
	return &out, c.do(ctx, http.MethodPatch, environmentPath(projectKey, key), map[string]any{"name": name}, &out)
}

// DeleteEnvironment deletes the environment with the targeting of every flag in it.
func (c *Client) DeleteEnvironment(ctx context.Context, projectKey, key string) error {
	return c.do(ctx, http.MethodDelete, environmentPath(projectKey, key), nil, nil)
}

func (c *Client) GetFlag(ctx context.Context, projectKey, key string) (*Flag, error) {
	var out Flag
	return &out, c.do(ctx, http.MethodGet, flagPath(projectKey, key), nil, &out)
}

// CreateFlag creates the flag; Core gives it off-state targeting in every environment.
func (c *Client) CreateFlag(ctx context.Context, projectKey, key string, input FlagInput) (*Flag, error) {
	var out Flag
	body := input.body()
	body["key"] = key
	return &out, c.do(ctx, http.MethodPost, projectPath(projectKey)+"/flags", body, &out)
}

// UpdateFlag edits the flag based on version; Core rejects a stale version with 409.
func (c *Client) UpdateFlag(ctx context.Context, projectKey, key string, version int64, input FlagInput) (*Flag, error) {
	var out Flag
	body := input.body()
	body["version"] = version
	return &out, c.do(ctx, http.MethodPatch, flagPath(projectKey, key), body, &out)
}

// DeleteFlag deletes the flag with its targeting in every environment.
func (c *Client) DeleteFlag(ctx context.Context, projectKey, key string) error {
	return c.do(ctx, http.MethodDelete, flagPath(projectKey, key), nil, nil)
}

func projectPath(key string) string { return "/projects/" + url.PathEscape(key) }

func environmentPath(projectKey, key string) string {
	return projectPath(projectKey) + "/environments/" + url.PathEscape(key)
}

func flagPath(projectKey, key string) string {
	return projectPath(projectKey) + "/flags/" + url.PathEscape(key)
}

func (c *Client) do(ctx context.Context, method, path string, body, out any) error {
	var reader io.Reader
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(encoded)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.apiURL+path, reader)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("X-CTFF-Actor", Actor)
	req.Header.Set("User-Agent", c.userAgent)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("%s %s: %w", method, path, err)
	}
	defer resp.Body.Close()
	payload, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("%s %s: reading the response: %w", method, path, err)
	}
	if resp.StatusCode >= 300 {
		return &APIError{Method: method, Path: path, Status: resp.StatusCode, Message: errorMessage(payload)}
	}
	if out == nil || len(payload) == 0 {
		return nil
	}
	if err := json.Unmarshal(payload, out); err != nil {
		return fmt.Errorf("%s %s: decoding the response: %w", method, path, err)
	}
	return nil
}

// errorMessage extracts NestJS's error message, which is a string or a list of validation messages.
func errorMessage(payload []byte) string {
	var body struct {
		Message json.RawMessage `json:"message"`
	}
	if json.Unmarshal(payload, &body) == nil && len(body.Message) > 0 {
		var single string
		if json.Unmarshal(body.Message, &single) == nil {
			return single
		}
		var list []string
		if json.Unmarshal(body.Message, &list) == nil {
			return strings.Join(list, "; ")
		}
	}
	return strings.TrimSpace(string(payload))
}
