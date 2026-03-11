/**
 * JWT authentication utilities and OTP generator
 *
 * Provides JWT signing/verification for access and refresh tokens,
 * plus secure 6-digit OTP generation for email-based authentication.
 */

import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';

// Throw fast if JWT_SECRET is not configured
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

// Type assertion: we've verified JWT_SECRET is a string
const SECRET: string = JWT_SECRET;

/**
 * JWT payload shape for access and refresh tokens
 */
export interface JwtPayload {
  /** User ID (subject) */
  sub: string;
  /** User email */
  email: string;
  /** Active project ID */
  projectId: string;
  /** Session ID */
  sessionId: string;
  /** Token type */
  type: 'access' | 'refresh';
}

export interface ShareTokenPayload {
  projectId: string;
  type: 'share';
}

/**
 * Base payload without the type field (for signing functions)
 */
type BasePayload = Omit<JwtPayload, 'type'>;

/**
 * Sign an access token (15 minute expiry)
 *
 * @param payload - User and session data
 * @returns Signed JWT access token
 */
export function signAccessToken(payload: BasePayload): string {
  return jwt.sign(
    { ...payload, type: 'access' as const },
    SECRET,
    { expiresIn: '15m' }
  );
}

/**
 * Sign a refresh token (7 day expiry)
 *
 * @param payload - User and session data
 * @returns Signed JWT refresh token
 */
export function signRefreshToken(payload: BasePayload): string {
  return jwt.sign(
    { ...payload, type: 'refresh' as const },
    SECRET,
    { expiresIn: '7d' }
  );
}

export function signShareToken(projectId: string): string {
  return jwt.sign(
    { projectId, type: 'share' as const },
    SECRET,
    { expiresIn: '30d' }
  );
}

/**
 * Verify a JWT token and return its payload
 *
 * @param token - JWT token to verify
 * @returns Decoded JWT payload
 * @throws jwt.JsonWebTokenError if token is invalid or expired
 */
export function verifyToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, SECRET) as JwtPayload;
  return decoded;
}

export function verifyShareToken(token: string): ShareTokenPayload {
  const decoded = jwt.verify(token, SECRET) as ShareTokenPayload;
  if (decoded.type !== 'share') {
    throw new Error('Invalid share token');
  }
  return decoded;
}

/**
 * Generate a secure 6-digit OTP code
 *
 * Uses crypto.randomInt for cryptographically secure random numbers.
 * Returns a zero-padded 6-digit string (e.g., '047821').
 *
 * @returns 6-digit OTP code as string
 */
export function generateOtp(): string {
  return String(crypto.randomInt(100000, 999999)).padStart(6, '0');
}
