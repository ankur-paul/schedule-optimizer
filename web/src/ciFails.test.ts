import { expect, test } from 'vitest'

test('fails on purpose to check CI goes red (T48, reverted next commit)', () => {
  expect(1).toBe(2)
})
