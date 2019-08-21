#!/usr/bin/env bash

#echo "开始发布新的主题";

SOURCE='/d/code/libragen.cn';
DEST='/d/code/tech.mojotv.cn'

rm -rf $DEST/_includes;
rm -rf $DEST/_layouts;
rm -rf $DEST/api;
rm -rf $DEST/assets/css;
rm -rf $DEST/assets/js;
rm -rf $DEST/assets/fonts;

cp -r $SOURCE/_includes $DEST/_includes;
cp -r $SOURCE/_layouts $DEST/_layouts;
cp -r $SOURCE/api $DEST/api;
cp -r $SOURCE/assets/css $DEST/assets/css;
cp -r $SOURCE/assets/js $DEST/assets/js;
cp -r $SOURCE/assets/fonts $DEST/assets/fonts;