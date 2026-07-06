import { describe, it, expect } from 'vitest'
import { users, teams, products, neighborhoods, houses, households, visits, accounts, sessions, statuses, businesses } from './schema'

describe('schema', () => {
  it('users table has required columns', () => {
    expect(users.id).toBeDefined()
    expect(users.email).toBeDefined()
    expect(users.role).toBeDefined()
    expect(users.teamId).toBeDefined()
  })

  it('visits table has required columns', () => {
    expect(visits.householdId).toBeDefined()
    expect(visits.contactStatus).toBeDefined()
    expect(visits.saleOutcome).toBeDefined()
    expect(visits.productId).toBeDefined()
  })

  it('houses table has structured address columns', () => {
    expect(houses.number).toBeDefined()
    expect(houses.street).toBeDefined()
    expect(houses.unit).toBeDefined()
    expect(houses.city).toBeDefined()
    expect(houses.region).toBeDefined()
    expect(houses.postcode).toBeDefined()
    expect(houses.location).toBeDefined()
    expect(houses.externalId).toBeDefined()
    // Verify DB column names match migration
    expect((houses.number as { name: string }).name).toBe('number')
    expect((houses.street as { name: string }).name).toBe('street')
    expect((houses.externalId as { name: string }).name).toBe('external_id')
    expect((houses.location as { name: string }).name).toBe('location')
  })

  it('houses table does not have old address/lat/lng columns', () => {
    expect((houses as unknown as Record<string, unknown>).address).toBeUndefined()
    expect((houses as unknown as Record<string, unknown>).lat).toBeUndefined()
    expect((houses as unknown as Record<string, unknown>).lng).toBeUndefined()
  })

  it('houses table has legal flag columns', () => {
    expect(houses.doNotKnock).toBeDefined()
    expect(houses.noSolicitingSign).toBeDefined()
  })

  it('statuses table has required columns', () => {
    expect(statuses.id).toBeDefined()
    expect(statuses.name).toBeDefined()
    expect(statuses.color).toBeDefined()
    expect(statuses.sortOrder).toBeDefined()
    expect(statuses.active).toBeDefined()
    expect(statuses.autoKey).toBeDefined()
    expect((statuses.sortOrder as { name: string }).name).toBe('sort_order')
    expect((statuses.autoKey as { name: string }).name).toBe('auto_key')
  })

  it('houses and businesses have statusId column', () => {
    expect(houses.statusId).toBeDefined()
    expect((houses.statusId as { name: string }).name).toBe('status_id')
    expect(businesses.statusId).toBeDefined()
    expect((businesses.statusId as { name: string }).name).toBe('status_id')
  })
})
