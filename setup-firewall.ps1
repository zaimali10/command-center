# Hermes Firewall Setup
# Run via scheduled task to avoid UAC prompt
netsh advfirewall firewall add rule name="Hermes Dashboard 9119" dir=in action=allow protocol=TCP localport=9119 profile=private description="Allow Hermes Agent Dashboard from iPad on home WiFi"
netsh advfirewall firewall add rule name="Command Center 8080" dir=in action=allow protocol=TCP localport=8080 profile=private description="Allow Command Center from iPad on home WiFi"
