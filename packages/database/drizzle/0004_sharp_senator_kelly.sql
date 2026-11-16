ALTER TABLE "pricing_config" ADD COLUMN "action_settings" jsonb DEFAULT '{
      "jd_analysis": {"model": "gpt-5.1", "promptOverheadTokens": 1500, "maxOutputTokens": 2000},
      "generation": {"model": "gpt-5.1", "promptOverheadTokens": 2500, "maxOutputTokens": 6000},
      "ats_scoring": {"model": "gpt-5.1", "promptOverheadTokens": 2000, "maxOutputTokens": 2500}
    }'::jsonb NOT NULL;