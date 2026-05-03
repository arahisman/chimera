import { describe, expect, test } from 'bun:test'
import { z } from 'zod/v4'
import { semanticNumber } from './semanticNumber.js'

describe('semanticNumber', () => {
  test('keeps optional object fields optional while coercing numeric strings', () => {
    const schema = z.strictObject({
      offset: semanticNumber(z.number().int().nonnegative().optional()),
    })

    expect(schema.safeParse({}).success).toBe(true)
    expect(schema.parse({ offset: '3' })).toEqual({ offset: 3 })
    expect(schema.safeParse({ offset: 'not-a-number' }).success).toBe(false)
  })

  test('keeps defaulted object fields defaulted', () => {
    const schema = z.strictObject({
      limit: semanticNumber(z.number().int().positive().default(10)),
    })

    expect(schema.parse({})).toEqual({ limit: 10 })
    expect(schema.parse({ limit: '25' })).toEqual({ limit: 25 })
  })
})
