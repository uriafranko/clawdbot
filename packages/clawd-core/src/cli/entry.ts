#!/usr/bin/env node
import { program } from "./program.js";

program.parseAsync(process.argv).catch((err) => {
  console.error("Fatal error:", err.message || err);
  process.exit(1);
});
