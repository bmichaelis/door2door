import {
  pgTable, uuid, text, boolean, timestamp, integer, primaryKey
} from 'drizzle-orm/pg-core'
import { customType } from 'drizzle-orm/pg-core'

// PostGIS polygon type (for neighborhood boundaries)
const geometry = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'geometry(Polygon, 4326)'
  },
})

// PostGIS point type (for house locations)
const geometryPoint = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'geometry(Point, 4326)'
  },
})

export const teams = pgTable('teams', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  managerId: uuid('manager_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name'),
  email: text('email').notNull().unique(),
  emailVerified: timestamp('email_verified'),
  image: text('image'),
  role: text('role', { enum: ['admin', 'manager', 'rep'] }),
  teamId: uuid('team_id').references(() => teams.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const accounts = pgTable('accounts', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  provider: text('provider').notNull(),
  providerAccountId: text('provider_account_id').notNull(),
  refresh_token: text('refresh_token'),
  access_token: text('access_token'),
  expires_at: integer('expires_at'),
  token_type: text('token_type'),
  scope: text('scope'),
  id_token: text('id_token'),
  session_state: text('session_state'),
}, (table) => ({
  pk: primaryKey({ columns: [table.provider, table.providerAccountId] }),
}))

export const sessions = pgTable('sessions', {
  sessionToken: text('session_token').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires').notNull(),
})

export const verificationTokens = pgTable('verification_tokens', {
  identifier: text('identifier').notNull(),
  token: text('token').notNull(),
  expires: timestamp('expires').notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.identifier, table.token] }),
}))

export const products = pgTable('products', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const neighborhoods = pgTable('neighborhoods', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  city: text('city'),
  teamId: uuid('team_id').references(() => teams.id),
  boundary: geometry('boundary'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const houses = pgTable('houses', {
  id: uuid('id').defaultRandom().primaryKey(),
  number: text('number').notNull(),
  street: text('street').notNull(),
  unit: text('unit'),
  city: text('city').notNull(),
  region: text('region').notNull(),
  postcode: text('postcode').notNull(),
  externalId: text('external_id').unique(),
  location: geometryPoint('location').notNull(),
  neighborhoodId: uuid('neighborhood_id').references(() => neighborhoods.id),
  doNotKnock: boolean('do_not_knock').default(false).notNull(),
  noSolicitingSign: boolean('no_soliciting_sign').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const households = pgTable('households', {
  id: uuid('id').defaultRandom().primaryKey(),
  houseId: uuid('house_id').notNull().references(() => houses.id),
  surname: text('surname'),
  headOfHouseholdName: text('head_of_household_name'),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const visits = pgTable('visits', {
  id: uuid('id').defaultRandom().primaryKey(),
  householdId: uuid('household_id').notNull().references(() => households.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  contactStatus: text('contact_status', { enum: ['answered', 'not_home', 'refused'] }).notNull(),
  interestLevel: text('interest_level', { enum: ['interested', 'not_interested', 'maybe'] }),
  notes: text('notes'),
  followUpAt: timestamp('follow_up_at'),
  saleOutcome: text('sale_outcome', { enum: ['sold', 'not_sold', 'follow_up'] }),
  productId: uuid('product_id').references(() => products.id),
  installDate: timestamp('install_date'),
  serviceDate: timestamp('service_date'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// Type exports
export type User = typeof users.$inferSelect
export type Team = typeof teams.$inferSelect
export type Product = typeof products.$inferSelect
export type Neighborhood = typeof neighborhoods.$inferSelect
export type House = typeof houses.$inferSelect
export type Household = typeof households.$inferSelect
export type Visit = typeof visits.$inferSelect

// HouseRow is the UI-facing type: location extracted to lat/lng by GET routes
export type HouseRow = Omit<House, 'location'> & { lat: number; lng: number }
