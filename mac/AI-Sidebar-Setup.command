#!/bin/bash
# AI Sidebar setup for macOS. Double-click to run (the first time: right-click → Open).
# It runs the same one-line installer as the README: https://github.com/Juan337492/aisidebar#install
clear
echo "Setting up AI Sidebar…"
echo
if curl -fsSL https://raw.githubusercontent.com/Juan337492/aisidebar/main/install.sh | bash; then
  echo
  echo "All set. You can close this window."
else
  echo
  echo "Setup didn't finish. Scroll up to see what went wrong, or visit https://github.com/Juan337492/aisidebar#install"
fi
echo
read -n 1 -s -r -p "Press any key to close…"
