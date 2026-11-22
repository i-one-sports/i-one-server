# Backend Observability

The API writes structured JSON logs to stdout and supports OpenTelemetry traces and metrics over OTLP/HTTP. The OpenTelemetry SDK is opt-in so local runs and tests do not attempt to export telemetry unless configured.

## Runtime Configuration

Set these variables in the runtime environment (not in the image):

```env
LOG_LEVEL=info
OTEL_ENABLED=true
OTEL_SERVICE_NAME=i-one-backend
OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318
OTEL_RESOURCE_ATTRIBUTES=deployment.environment.name=dev
```

`OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` and `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT` can override the default `/v1/traces` and `/v1/metrics` paths. `OTEL_EXPORTER_OTLP_HEADERS` accepts comma-separated OTLP headers when the collector requires authentication.

The Node SDK starts before the NestJS entry point in production. Set `OTEL_ENABLED=true` only after the infrastructure deployment provides a reachable OTLP collector. It flushes on `SIGTERM`/`SIGINT`; configure the container stop grace period to allow that shutdown to complete.

## Signals

- Logs include a generated `x-request-id`, method, route template, status, duration, and active trace/span IDs. Authorization, cookie, and set-cookie headers are redacted by the logger; request/response bodies and exception messages are not logged. `X-Request-Id` is exposed for browser clients to correlate support reports with server logs.
- HTTP metrics use `http.server.request.count` and `http.server.request.duration`, tagged with method, route template, and status code. Do not add user, email, location, or other unbounded identifiers as metric attributes.
- Automatic Node instrumentation captures HTTP and supported dependency spans. MongoDB and Redis statement attributes are reduced to the command name to avoid exporting query arguments. Do not put secrets or personal data in URL query parameters. Add manual spans around important business operations when their boundaries need more context.

## Infrastructure Contract

The separate infra repository must run a Collector reachable from the app container, accept OTLP/HTTP on port 4318, and configure the appropriate AWS exporter and IAM permissions. CloudWatch Agent/log routing must collect the container's stdout/stderr. Restrict collector access to the private application network and choose log retention and trace sampling deliberately.
