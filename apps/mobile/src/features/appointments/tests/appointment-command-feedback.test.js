import { describe, expect, it } from 'vitest'
import { isCurrentAppointmentResult } from '../appointment-presentation.js'

const started = { id: 'appointment-a', revision: 1, status: 'in_progress' }

describe('command feedback follows the currently confirmed appointment revision', () => {
  it('keeps success for the same confirmed result, including an equivalent fresh GET', () => {
    expect(isCurrentAppointmentResult(started, { ...started })).toBe(true)
  })
  it('hides the old Start success after correction, ETA or Complete', () => {
    for (const status of ['confirmed', 'in_progress', 'completed'])
      expect(isCurrentAppointmentResult(started, { ...started, revision: 2, status })).toBe(false)
  })
  it('hides Complete success after reopening even if the appointment ID is unchanged', () => {
    expect(isCurrentAppointmentResult({ ...started, revision: 4, status: 'completed' },
      { ...started, revision: 5 })).toBe(false)
  })
  it('does not show old success while loading, after scope change or without a server revision', () => {
    expect(isCurrentAppointmentResult(started, null)).toBe(false)
    expect(isCurrentAppointmentResult(undefined, started)).toBe(false)
    expect(isCurrentAppointmentResult(started, { ...started, id: 'appointment-b' })).toBe(false)
    expect(isCurrentAppointmentResult({ ...started, revision: undefined }, started)).toBe(false)
    expect(isCurrentAppointmentResult(started, { ...started, status: 'confirmed' })).toBe(false)
  })
})
