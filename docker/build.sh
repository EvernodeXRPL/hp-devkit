#!/bin/bash

cp ../LICENCE .
docker build -t evernodedev/hpdevkit .
rm LICENCE