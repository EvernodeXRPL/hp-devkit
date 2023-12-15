#!/bin/bash

cp ../evernode-license.pdf .
docker build -t evernode/hpdevkit .
rm evernode-license.pdf
