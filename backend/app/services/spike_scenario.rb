# fixtures/spike/three_residents.json から試行（SimulationRun）と初期記憶を作る。
# memory_ids を指定すると、その記憶だけを持たせる（記憶条件だけを変える比較用）。
class SpikeScenario
  FIXTURE_PATH = Rails.root.join("../fixtures/spike/three_residents.json")

  def self.load(locations:, memory_ids: nil, path: FIXTURE_PATH)
    data = JSON.parse(File.read(path))
    facts = data.fetch("events").index_by { |e| e.fetch("id") }
    memories = data.fetch("memories")
    memories = memories.select { |m| memory_ids.include?(m.fetch("id")) } if memory_ids

    SimulationRun.transaction do
      run = SimulationRun.create!(step: data.fetch("initial_step"), locations: locations)
      memories.each do |m|
        run.memories.create!(
          owner: m.fetch("owner"), fact_key: m.fetch("source_event_id"),
          content: facts.fetch(m.fetch("source_event_id")).fetch("fact"),
          interpretation: m["interpretation"], source: m.fetch("source"), acquired_step: m.fetch("acquired_step")
        )
      end
      run
    end
  end
end
