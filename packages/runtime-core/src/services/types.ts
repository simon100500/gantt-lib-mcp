/**
 * Service layer type definitions and utility functions
 *
 * Provides type-safe date conversion utilities between Prisma DateTime objects
 * and domain type YYYY-MM-DD strings.
 */

/**
 * Convert Prisma DateTime to domain date string (YYYY-MM-DD)
 *
 * Extracts the date portion from an ISO 8601 datetime string.
 * This is lossless for dates stored at midnight UTC.
 *
 * @param date - Date object from Prisma
 * @returns Date string in YYYY-MM-DD format
 */
export function dateToDomain(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Convert domain date string to Date object
 *
 * Parses a YYYY-MM-DD string into a Date object.
 * The time is set to midnight UTC to ensure consistent conversions.
 *
 * @param dateStr - Date string in YYYY-MM-DD format
 * @returns Date object
 */
export function domainToDate(dateStr: string): Date {
  return new Date(dateStr);
}

/**
 * Service configuration interface for dependency injection
 *
 * Allows services to be instantiated with custom Prisma Client instances
 * for testing or alternative configurations.
 */
export interface ServiceConfig {
  prisma: any; // PrismaClient - using any to avoid circular dependency
}
