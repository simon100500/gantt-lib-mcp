import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Simple setup - jest-dom matchers will be available via vitest globals
afterEach(() => {
  cleanup()
})
