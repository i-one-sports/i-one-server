if (process.env.OTEL_ENABLED === 'true') {
  const { NodeSDK } = require('@opentelemetry/sdk-node');
  const {
    getNodeAutoInstrumentations,
  } = require('@opentelemetry/auto-instrumentations-node');
  const {
    OTLPMetricExporter,
  } = require('@opentelemetry/exporter-metrics-otlp-proto');
  const {
    OTLPTraceExporter,
  } = require('@opentelemetry/exporter-trace-otlp-proto');
  const {
    PeriodicExportingMetricReader,
  } = require('@opentelemetry/sdk-metrics');

  const endpoint = (
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://127.0.0.1:4318'
  ).replace(/\/$/, '');
  const headers = process.env.OTEL_EXPORTER_OTLP_HEADERS?.split(',')
    .map((header) => header.split('='))
    .reduce((result, [key, ...value]) => {
      if (key && value.length) result[key.trim()] = value.join('=').trim();
      return result;
    }, {});

  const sdk = new NodeSDK({
    serviceName: process.env.OTEL_SERVICE_NAME || 'i-one-backend',
    traceExporter: new OTLPTraceExporter({
      url:
        process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ||
        `${endpoint}/v1/traces`,
      headers,
    }),
    metricReaders: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({
          url:
            process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT ||
            `${endpoint}/v1/metrics`,
          headers,
        }),
        exportIntervalMillis: 60_000,
      }),
    ],
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-mongodb': {
          dbStatementSerializer: (command) =>
            Object.keys(command)[0] || 'mongodb',
        },
        '@opentelemetry/instrumentation-ioredis': {
          dbStatementSerializer: (commandName) => commandName,
        },
      }),
    ],
  });

  sdk.start();

  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.once(signal, () => {
      sdk.shutdown().catch((error) => {
        process.stderr.write(
          `OpenTelemetry shutdown failed: ${error?.name || 'Error'}\n`,
        );
      });
    });
  }
}
