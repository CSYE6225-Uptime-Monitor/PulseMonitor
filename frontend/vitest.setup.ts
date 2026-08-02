import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Explicit afterEach import (rather than `test.globals: true`) matches how
// every test file imports describe/it/expect explicitly from "vitest".
afterEach(cleanup);
