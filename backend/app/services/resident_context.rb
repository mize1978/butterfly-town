# 行動選択（固定応答／将来のLLM）へ渡す入力。本人の記憶だけを含め、世界全体や他人の記憶は含めない。
class ResidentContext
  def self.build(run, resident_id, scene:)
    {
      "resident_id" => resident_id,
      "scene" => scene,
      "step" => run.step,
      "location" => run.locations[resident_id],
      "memories" => run.memories.known_at(run.step).where(owner: resident_id).order(:acquired_step, :id).map do |m|
        {"fact_key" => m.fact_key, "content" => m.content, "interpretation" => m.interpretation, "source" => m.source}
      end
    }
  end
end
