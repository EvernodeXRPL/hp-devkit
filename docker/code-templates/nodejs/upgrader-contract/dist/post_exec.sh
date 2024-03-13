#!/bin/bash

# Install unzip, jq if not installed, because it's required for the upgrader.

if ! command -v unzip &>/dev/null; then
    echo "Installing unzip"
    apt-get update
    apt-get install -y unzip
fi

if ! command -v jq &>/dev/null; then
    echo "Installing unzip"
    apt-get update
    apt-get install -y jq
fi