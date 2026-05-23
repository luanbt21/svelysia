import { Type, type Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

const URI_PATTERN = "^postgres://|^mysql://|^file://|^https?://";
const EMAIL_PATTERN = "^[\\w-\\.]+@([\\w-]+\\.)+[\\w-]{2,4}$";

const CommonVars = Type.Object({
  PORT: Type.Number({ default: 3000 }),
  DATABASE_URL: Type.String({ pattern: URI_PATTERN }),
});

const TracingEnabled = Type.Object({
  ENABLE_TRACING: Type.Boolean(),
  OPEN_OBSERVE_ORGANIZATION: Type.String({ minLength: 1 }),
  OPEN_OBSERVE_STREAM_NAME: Type.String({ minLength: 1 }),
  OPEN_OBSERVE_URL: Type.String({ pattern: URI_PATTERN }),
  OPEN_OBSERVE_EMAIL: Type.String({ pattern: EMAIL_PATTERN }),
  OPEN_OBSERVE_PASSWORD: Type.String({ minLength: 1 }),
});

const S3Env = Type.Object({
  AWS_ACCESS_KEY_ID: Type.String(),
  AWS_SECRET_ACCESS_KEY: Type.String(),
  S3_ENDPOINT: Type.String(),
  AWS_REGION: Type.String(),
  S3_BUCKET: Type.String(),
});

const AuthEnv = Type.Object({
  ORIGIN: Type.String(),
  GOOGLE_CLIENT_ID: Type.String(),
  GOOGLE_CLIENT_SECRET: Type.String(),
  GITHUB_CLIENT_ID: Type.String(),
  GITHUB_CLIENT_SECRET: Type.String(),
});

const EnvSchema = Type.Intersect([CommonVars, TracingEnabled, S3Env, AuthEnv]);

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
          console.error(`- ${e.path}: Must be a valid connection URI (e.g. postgres://...)`);
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
