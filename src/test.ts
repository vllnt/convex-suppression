/// <reference types="vite/client" />
import type { GenericSchema, SchemaDefinition } from "convex/server";
import type { TestConvex } from "convex-test";
import schema from "./component/schema.js";

const modules = import.meta.glob("./component/**/*.ts");

/**
 * Register this component with a `convex-test` instance so consuming apps can
 * test integration: `import { register } from "@vllnt/convex-suppression/test"`.
 * `t` is the host app's `convexTest(hostSchema, modules)`; `name` is the mount
 * name (default `"suppression"`, the name `app.use(component)` gives it).
 */
export function register<TSchema extends GenericSchema>(
  t: TestConvex<SchemaDefinition<TSchema, boolean>>,
  name = "suppression",
): void {
  t.registerComponent(name, schema, modules);
}
