# #30 AI を呼ぶ前に止まった・API が受け付けなかった（課金されていない）ときの中断の理由 ai_unavailable を足す
class AddAiUnavailableToTimeSlotSuspendReasons < ActiveRecord::Migration[8.1]
  OLD = %w[budget network unknown_result version_mismatch].freeze
  NEW = (OLD + %w[ai_unavailable]).freeze

  def up = replace(NEW)
  def down = replace(OLD)

  private

  def replace(reasons)
    remove_check_constraint :time_slot_runs, name: "time_slot_runs_suspend_reason"
    add_check_constraint :time_slot_runs, "suspend_reason IS NULL OR suspend_reason IN (#{reasons.map { "'#{_1}'" }.join(', ')})",
                         name: "time_slot_runs_suspend_reason"
  end
end
