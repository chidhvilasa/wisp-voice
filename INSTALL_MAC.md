# Install Wisp on macOS

## One-command install (Terminal):

```sh
curl -L https://github.com/chidhvilasa/wisp-voice/releases/latest/download/Wisp_0.3.0_universal.dmg -o /tmp/Wisp.dmg && xattr -cr /tmp/Wisp.dmg && hdiutil attach /tmp/Wisp.dmg && sudo cp -r "/Volumes/Wisp/Wisp.app" /Applications/ && sudo xattr -cr /Applications/Wisp.app && hdiutil detach "/Volumes/Wisp" && open /Applications/Wisp.app
```

## If macOS still blocks it:

```sh
sudo xattr -cr /Applications/Wisp.app && open /Applications/Wisp.app
```

## Grant microphone permission:

System Settings → Privacy & Security → Microphone → Enable Wisp
