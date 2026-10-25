require "json"
run = SimulationRun.create!(locations: {"A" => "plaza", "B" => "plaza", "C" => "plaza"})
processor = FixedActionProcessor.new(run)
previous = nil
[["invited", "A", "B"], ["accepted", "B", "A"], ["worked", "B", nil]].each do |kind, actor, target|
  previous = processor.call(command_id: kind, kind: kind, actor: actor, target: target,
    task: "setup", step: 0, cause_id: previous&.id)
  puts({event: previous.kind, event_id: previous.id, cause_id: previous.cause_id,
    preparation: run.reload.progress}.to_json)
end
