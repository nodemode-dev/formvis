cask "formvis" do
  version "1.89.0"
  sha256 "REPLACE_WITH_THE_RELEASE_DMG_SHA256"

  url "https://github.com/nodemode-ai/formvis/releases/download/v#{version}/formvis_#{version}_aarch64.dmg"
  name "formvis"
  desc "Layered image editor"
  homepage "https://github.com/nodemode-ai/formvis"

  livecheck do
    url :url
    strategy :github_latest
  end

  depends_on arch: :arm64
  depends_on macos: ">= :monterey"

  app "formvis.app"

  zap trash: [
    "~/Formvis",
    "~/Library/Application Support/ai.nodemode.formvis",
    "~/Library/Caches/ai.nodemode.formvis",
    "~/Library/Preferences/ai.nodemode.formvis.plist",
  ]
end
