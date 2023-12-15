#!/bin/bash

cp ../evernode-license.pdf .
docker build -t evernodedev/hpdevkit .
rm evernode-license.pdf