#!/bin/bash

cp ../LICENSE.pdf .
docker build -t evernodedev/hpdevkit .
rm LICENSE.pdf