import { cleanup } from "@solidjs/testing-library";
import "@testing-library/jest-dom/vitest";
import { Dynamic } from "solid-js/web";
import { afterEach, vi } from "vitest";

vi.mock(
  "solid-motionone",
  () => ({
    Motion: new Proxy({}, {
      get: (_, property) =>
        (props: { children?: unknown }) => Dynamic({ ...props, component: String(property) }),
    }),
    Presence: (props: { children?: unknown }) => props.children as unknown,
  }),
);

Object.defineProperty(globalThis, "scrollTo", { value: vi.fn(), writable: true });

afterEach(cleanup);
