import { describe, expect, it } from 'vitest';
import { assertTransition } from '../backend/src/bookingState';
describe('booking state machine', () => { it('allows payment confirmation', () => expect(() => assertTransition('PAYMENT_PENDING', 'CONFIRMED')).not.toThrow()); it('blocks skipping a hold', () => expect(() => assertTransition('AVAILABLE', 'CONFIRMED')).toThrow()); });
