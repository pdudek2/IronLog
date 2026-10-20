export type FaultOutcome =
  | 'failed_after_workout_before_projection'
  | 'failed_after_sessions_before_records'
  | 'failed_after_records_before_materialized_flag'
  | 'failed_after_delete_claim'
  | 'failed_after_delete_sessions'
  | 'failed_before_delete_records'

export class ReviewFault extends Error {
  readonly outcome: FaultOutcome

  constructor(outcome: FaultOutcome) {
    super(outcome)
    this.outcome = outcome
    this.name = 'ReviewFault'
  }
}
