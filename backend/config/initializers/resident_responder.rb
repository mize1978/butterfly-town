# 住民の判断の作り手（#30）を起動時に決める。RESIDENT_RESPONDER=llm なのに API キーが無いときは、ここで起動を失敗させる
Rails.application.config.after_initialize { ResidentResponder.default }
