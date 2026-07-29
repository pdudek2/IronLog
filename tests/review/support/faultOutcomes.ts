export type FaultOutcome =
  | 'failed_before_remote_commit'
  | 'remote_commit_succeeded_ack_lost'
  | 'failed_after_workout_before_projection'
  | 'failed_after_sessions_before_records'
  | 'failed_after_records_before_materialized_flag'
  | 'failed_after_delete_claim'
  | 'failed_after_delete_sessions'
  | 'failed_before_delete_records'
  | 'active_session_delete_failed'

export class ReviewFault extends Error {
  constructor(readonly outcome: FaultOutcome) {
    super(outcome)
    this.name = 'ReviewFault'
  }
}
