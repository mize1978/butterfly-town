require_relative "boot"

require "rails"
# Pick the frameworks you want:
require "active_model/railtie"
# require "active_job/railtie"
require "active_record/railtie"
# require "active_storage/engine"
require "action_controller/railtie"
# require "action_mailer/railtie"
# require "action_mailbox/engine"
# require "action_text/engine"
require "action_view/railtie"
# require "action_cable/engine"
require "rails/test_unit/railtie"

# Require the gems listed in Gemfile, including any gems
# you've limited to :test, :development, or :production.
Bundler.require(*Rails.groups)

module Backend
  class Application < Rails::Application
    # Initialize configuration defaults for originally generated Rails version.
    config.load_defaults 8.1

    # Please, add to the `ignore` list any other `lib` subdirectories that do
    # not contain `.rb` files, or that should not be reloaded or eager loaded.
    # Common ones are `templates`, `generators`, or `middleware`, for example.
    config.autoload_lib(ignore: %w[assets tasks])

    # Configuration for the application, engines, and railties goes here.
    #
    # These settings can be overridden in specific environments using the files
    # in config/environments, which are processed later.
    #
    # config.time_zone = "Central Time (US & Canada)"
    # config.eager_load_paths << Rails.root.join("extras")

    # Only loads a smaller set of middleware suitable for API only apps.
    # Middleware like session, flash, cookies can be added back manually.
    # Skip views, helpers and assets when generating a new resource.
    config.api_only = true
    # ゲストの Cookie（#7）を読み書きするため、API モードでも Cookie だけは使う
    config.middleware.use ActionDispatch::Cookies

    # 信頼できる中継（#35 回数制限のアクセス元）。本番は 利用者 → Cloudflare → Render の振り分け → Rails の順に届くので、
    # Rails の既定（社内向けの IP。Render の振り分け）に、Cloudflare が公開している範囲（config/cloudflare_ips.yml）を足す。
    # これで request.remote_ip は、Cloudflare が X-Forwarded-For に書き足した利用者の IP になる
    cloudflare = YAML.safe_load_file(File.expand_path("cloudflare_ips.yml", __dir__)).values.flatten.map { IPAddr.new(_1) }
    config.action_dispatch.trusted_proxies = ActionDispatch::RemoteIp::TRUSTED_PROXIES + cloudflare
  end
end
