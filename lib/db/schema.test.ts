import { describe, it, expect } from 'vitest'
import { users, teams, products, neighborhoods, houses, households, visits, accounts, sessions } from './schema'

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
    expect(houses.city).toBeDefined()
    expect(houses.region).toBeDefined()
    expect(houses.postcode).toBeDefined()
    expect(houses.location).toBeDefined()
    expect(houses.externalId).toBeDefined()
  })

  it('houses table has legal flag columns', () => {
    expect(houses.doNotKnock).toBeDefined()
    expect(houses.noSolicitingSign).toBeDefined()
  })
})
