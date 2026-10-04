// Usage: node --experimental-strip-types --import ./scripts/register-ts-alias.mjs --test <files>
import { register } from "node:module";

register("./ts-alias-hooks.mjs", import.meta.url);
