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
	// Archived is set while the flag is archived: not served, and not changeable until it is restored.
	Archived    bool     `json:"archived"`
}

// FlagInput is the editable part of a flag. The client always marks the flag as managed by Terraform.
type FlagInput struct {
	Name        string
	Description string
	Tags        []string
}

func (input FlagInput) body() map[string]any {
	tags := input.Tags
	if tags == nil {
		tags = []string{}
	}
	return map[string]any{"name": input.Name, "description": input.Description, "tags": tags, "managedBy": ManagedBy}
}

// Ref addresses an environment or a flag: the key of its project and its own key.
type Ref struct {
	ProjectKey string
	Key        string
}

// ID is the Terraform resource ID of what the ref addresses, and its import ID: "<project key>/<key>".
func (r Ref) ID() string { return r.ProjectKey + "/" + r.Key }

// ParseRef parses an ID made by Ref.ID.
func ParseRef(id string) (Ref, error) {
	projectKey, key, ok := strings.Cut(id, "/")
	if !ok || projectKey == "" || key == "" || strings.Contains(key, "/") {
		return Ref{}, fmt.Errorf("expected <project key>/<key>, got %q", id)
	}
	return Ref{ProjectKey: projectKey, Key: key}, nil
}

// Ref addresses the environment.
func (e *Environment) Ref() Ref { return Ref{ProjectKey: e.ProjectKey, Key: e.Key} }

// Ref addresses the flag.
func (f *Flag) Ref() Ref { return Ref{ProjectKey: f.ProjectKey, Key: f.Key} }

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

func (c *Client) GetEnvironment(ctx context.Context, ref Ref) (*Environment, error) {
	var out Environment
	return &out, c.do(ctx, http.MethodGet, environmentPath(ref), nil, &out)
}

// CreateEnvironment creates the environment; Core generates its SDK key.
func (c *Client) CreateEnvironment(ctx context.Context, ref Ref, name string) (*Environment, error) {
	var out Environment
	body := map[string]any{"key": ref.Key, "name": name}
	return &out, c.do(ctx, http.MethodPost, projectPath(ref.ProjectKey)+"/environments", body, &out)
}

func (c *Client) UpdateEnvironment(ctx context.Context, ref Ref, name string) (*Environment, error) {
	var out Environment
	return &out, c.do(ctx, http.MethodPatch, environmentPath(ref), map[string]any{"name": name}, &out)
}

// DeleteEnvironment deletes the environment with the targeting of every flag in it.
func (c *Client) DeleteEnvironment(ctx context.Context, ref Ref) error {
	return c.do(ctx, http.MethodDelete, environmentPath(ref), nil, nil)
}

func (c *Client) GetFlag(ctx context.Context, ref Ref) (*Flag, error) {
	var out Flag
	return &out, c.do(ctx, http.MethodGet, flagPath(ref), nil, &out)
}

// CreateFlag creates the flag, managed by Terraform; Core gives it off-state targeting in every environment.
func (c *Client) CreateFlag(ctx context.Context, ref Ref, input FlagInput) (*Flag, error) {
	var out Flag
	body := input.body()
	body["key"] = ref.Key
	return &out, c.do(ctx, http.MethodPost, projectPath(ref.ProjectKey)+"/flags", body, &out)
}

// UpdateFlag edits the flag based on version, marking it as managed by Terraform; Core rejects a stale version
// with 409.
func (c *Client) UpdateFlag(ctx context.Context, ref Ref, version int64, input FlagInput) (*Flag, error) {
	var out Flag
	body := input.body()
	body["version"] = version
	return &out, c.do(ctx, http.MethodPatch, flagPath(ref), body, &out)
}

// DeleteFlag permanently deletes the flag with its targeting in every environment. Core only deletes archived
// flags, so it archives the flag first (archiving an archived flag changes nothing). These are two calls: when the
// delete fails after the archive succeeded, the flag is left archived (and no longer served) and the error is
// returned, so the destroy fails and can be retried.
func (c *Client) DeleteFlag(ctx context.Context, ref Ref) error {
	if err := c.do(ctx, http.MethodPost, flagPath(ref)+"/archive", nil, nil); err != nil {
		return err
	}
	return c.do(ctx, http.MethodDelete, flagPath(ref), nil, nil)
}

func projectPath(key string) string { return "/projects/" + url.PathEscape(key) }

func environmentPath(ref Ref) string {
	return projectPath(ref.ProjectKey) + "/environments/" + url.PathEscape(ref.Key)
}

func flagPath(ref Ref) string {
	return projectPath(ref.ProjectKey) + "/flags/" + url.PathEscape(ref.Key)
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
