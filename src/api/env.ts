import { Type, type Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

const URI_PATTERN = "^postgres://|^mysql://|^file://|^https?://";
const EMAIL_PATTERN = "^[\\w-\\.]+@([\\w-]+\\.)+[\\w-]{2,4}$";

const CommonVars = Type.Object({
  PORT: Type.Number({ default: 3000 }),
  DATABASE_URL: Type.String({ pattern: URI_PATTERN }),
});

const TracingEnabled = Type.Object({
  ENABLE_TRACING: Type.Literal(true),
  OPEN_OBSERVE_ORGANIZATION: Type.String({ minLength: 1 }),
  OPEN_OBSERVE_STREAM_NAME: Type.String({ minLength: 1 }),
  OPEN_OBSERVE_URL: Type.String({ pattern: URI_PATTERN }),
  OPEN_OBSERVE_EMAIL: Type.String({ pattern: EMAIL_PATTERN }),
  OPEN_OBSERVE_PASSWORD: Type.String({ minLength: 1 }),
});

const TracingDisabled = Type.Object({
  ENABLE_TRACING: Type.Literal(false, { default: false }),
  OPEN_OBSERVE_ORGANIZATION: Type.Optional(Type.String()),
  OPEN_OBSERVE_STREAM_NAME: Type.Optional(Type.String()),
  OPEN_OBSERVE_URL: Type.Optional(Type.String()),
  OPEN_OBSERVE_EMAIL: Type.Optional(Type.String()),
  OPEN_OBSERVE_PASSWORD: Type.Optional(Type.String()),
});

const EnvSchema = Type.Intersect([
  CommonVars,
  Type.Union([TracingEnabled, TracingDisabled]),
]);

export type Env = Static<typeof EnvSchema>;

function validateEnv(): Env {
  const converted = Value.Convert(EnvSchema, process.env);

  if (!Value.Check(EnvSchema, converted)) {
    const errors = [...Value.Errors(EnvSchema, converted)];
    console.error("❌ Invalid Environment Variables:");

    for (const e of errors) {
      // Filter out union noise
      if (e.message !== "Expected union value") {
        // Customized error messages for patterns
        if (e.path.includes("DATABASE_URL") && e.type === 52) {
          // 52 is Pattern mismatch
          console.error(
            `- ${e.path}: Must be a valid connection URI (e.g. postgres://...)`,
          );
        } else if (e.path.includes("EMAIL") && e.type === 52) {
          console.error(`- ${e.path}: Must be a valid email address`);
        } else {
          console.error(`- ${e.path}: ${e.message}`);
        }
      }
    }
    process.exit(1);
  }

  return converted;
}

export const env = validateEnv();
