import { describe, it, expect } from 'vitest'
import { maxNewHires } from '../src/ui/decisions.ts'

describe('maxNewHires', () => {
  it('returns remaining headroom under the data cap', () => {
    expect(maxNewHires(20, 25)).toBe(5)
    expect(maxNewHires(25, 25)).toBe(0)
  })
})
