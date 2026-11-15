package provider

import (
	"bufio"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"syscall"
	"testing"
	"time"

	"github.com/hashicorp/terraform-plugin-framework/providerserver"
	"github.com/hashicorp/terraform-plugin-go/tfprotov6"
	"github.com/jackc/pgx/v5"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"

	"github.com/kevinverreault/capture-the-feature-flag/apps/terraform-provider-ctff/internal/client"
)

// The S4 acceptance tests drive the provider through Terraform against a real Core on PostgreSQL 17:
//
//   - CTFF_BASE_URL set: use that Core (e.g. `docker compose up`); its logs aren't available.
//   - otherwise: start the built Core (apps/core/dist/main.js) on a fresh database, on the PostgreSQL server at
//     CTFF_TEST_DATABASE_URL, or in a Testcontainers postgres:17-alpine when that isn't set either.
//
// Like every acceptance test, they only run with TF_ACC=1 (the Nx test target sets it).

var protoV6ProviderFactories = map[string]func() (tfprotov6.ProviderServer, error){
	"ctff": providerserver.NewProtocol6WithError(New("test")()),
}

// testCore is the Core this run started, or nil when it uses an external one.
var testCore *runningCore

// coreMainJS is the built Core, relative to this package.
const coreMainJS = "../../../core/dist/main.js"

func TestMain(m *testing.M) {
	os.Exit(run(m))
}

func run(m *testing.M) int {
	if os.Getenv("TF_ACC") == "" || os.Getenv(BaseURLEnv) != "" {
		return m.Run()
	}
	ctx := context.Background()
	databaseURL, stopDatabase, err := createDatabase(ctx)
	if err != nil {
		fmt.Fprintln(os.Stderr, "acceptance tests: starting PostgreSQL:", err)
		return 1
	}
	defer stopDatabase()
	core, err := startCore(databaseURL)
	if err != nil {
		fmt.Fprintln(os.Stderr, "acceptance tests: starting Core:", err)
		return 1
	}
	defer core.stop()
	testCore = core
	os.Setenv(BaseURLEnv, core.baseURL)
	return m.Run()
}

// createDatabase creates an empty database and returns its URL, with a function releasing the server.
func createDatabase(ctx context.Context) (string, func(), error) {
	adminURL := os.Getenv("CTFF_TEST_DATABASE_URL")
	stop := func() {}
	if adminURL == "" {
		container, err := postgres.Run(ctx, "postgres:17-alpine",
			postgres.WithDatabase("ctff"), postgres.WithUsername("ctff"), postgres.WithPassword("ctff"),
			postgres.BasicWaitStrategies())
		if err != nil {
			return "", stop, err
		}
		stop = func() { _ = testcontainers.TerminateContainer(container) }
		if adminURL, err = container.ConnectionString(ctx, "sslmode=disable"); err != nil {
			stop()
			return "", func() {}, err
		}
	}

	suffix := make([]byte, 6)
	_, _ = rand.Read(suffix)
	name := "ctff_acc_" + hex.EncodeToString(suffix)
	conn, err := pgx.Connect(ctx, adminURL)
	if err != nil {
		stop()
		return "", func() {}, err
	}
	defer conn.Close(ctx)
	if _, err := conn.Exec(ctx, `CREATE DATABASE "`+name+`"`); err != nil {
		stop()
		return "", func() {}, err
	}
	databaseURL, err := url.Parse(adminURL)
	if err != nil {
		stop()
		return "", func() {}, err
	}
	databaseURL.Path = "/" + name
	return databaseURL.String(), stop, nil
}

// runningCore is a Core process, with the JSON log lines it has written.
type runningCore struct {
	baseURL string
	cmd     *exec.Cmd
	mu      sync.Mutex
	logs    []map[string]any
	exited  chan struct{}
}

func startCore(databaseURL string) (*runningCore, error) {
	mainJS, err := filepath.Abs(coreMainJS)
	if err != nil {
		return nil, err
	}
	if _, err := os.Stat(mainJS); err != nil {
		return nil, fmt.Errorf("%s is missing; build Core first (pnpm nx run @ctff/core:build): %w", mainJS, err)
	}
	cmd := exec.Command("node", mainJS)
	cmd.Env = []string{
		"PATH=" + os.Getenv("PATH"),
		"DATABASE_URL=" + databaseURL,
		"PORT=0",
		"HOST=127.0.0.1",
		"LOG_LEVEL=info",
	}
	cmd.Stderr = os.Stderr
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	if err := cmd.Start(); err != nil {
		return nil, err
	}
	core := &runningCore{cmd: cmd, exited: make(chan struct{})}
	listening := make(chan int, 1)
	go func() {
		scanner := bufio.NewScanner(stdout)
		scanner.Buffer(make([]byte, 1024*1024), 1024*1024)
		for scanner.Scan() {
			var entry map[string]any
			if json.Unmarshal(scanner.Bytes(), &entry) != nil {
				entry = map[string]any{"unparsed": scanner.Text()}
			}
			core.mu.Lock()
			core.logs = append(core.logs, entry)
			core.mu.Unlock()
			if port, ok := entry["port"].(float64); ok && entry["msg"] == "Core listening" {
				listening <- int(port)
			}
		}
	}()
	go func() {
		_ = cmd.Wait()
		close(core.exited)
	}()

	select {
	case port := <-listening:
		core.baseURL = fmt.Sprintf("http://127.0.0.1:%d", port)
		return core, nil
	case <-core.exited:
		return nil, errors.New("core exited before listening")
	case <-time.After(60 * time.Second):
		core.stop()
		return nil, errors.New("core did not start listening within 60s")
	}
}

func (c *runningCore) stop() {
	select {
	case <-c.exited:
		return
	default:
	}
	_ = c.cmd.Process.Signal(syscall.SIGTERM)
	select {
	case <-c.exited:
	case <-time.After(10 * time.Second):
		_ = c.cmd.Process.Kill()
	}
}

// logCount and logsSince let a test look at the requests Core logged while it ran.
func (c *runningCore) logCount() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return len(c.logs)
}

func (c *runningCore) logsSince(index int) []map[string]any {
	c.mu.Lock()
	defer c.mu.Unlock()
	return append([]map[string]any{}, c.logs[index:]...)
}

// testAPI is a client for checking, and changing outside Terraform, what Core holds.
func testAPI(t *testing.T) *client.Client {
	t.Helper()
	c, err := client.New(os.Getenv(BaseURLEnv), "ctff-acceptance-test")
	if err != nil {
		t.Fatal(err)
	}
	return c
}

// randomKey is a key unique to this run, so tests sharing a Core don't collide.
func randomKey(prefix string) string {
	suffix := make([]byte, 4)
	_, _ = rand.Read(suffix)
	return prefix + "-" + hex.EncodeToString(suffix)
}
