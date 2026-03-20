import { vi } from 'vitest'

// jsdom does not implement ResizeObserver — stub it globally for all tests
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
)
