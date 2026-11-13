#!/bin/bash
# UI-25: the small font for the time of day on the running screen, smaller than the watch's own
# smallest. Makes a BMFont (time.fnt and time.png) of just what a time needs, "0123456789: APM".
#
#   tools/fonts/time-font.sh <pixel size> <output folder> [font file]
#
# The font file defaults to Roboto Condensed Regular from the Connect IQ SDK's fonts (Apache 2.0),
# close to the watches' own. Needs ImageMagick. The sizes for each screen are in tools/fonts/README.md.
set -euo pipefail
size=$1
out=$2
ttf=${3:-"$HOME/Library/Application Support/Garmin/ConnectIQ/Fonts/RobotoCondensed-Regular.ttf"}
chars="0123456789: APM"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$out"

height=$(magick -background none -fill white -font "$ttf" -pointsize "$size" label:"0AMP" -format "%h" info:)
x=0
lines=""
files=()
for ((i = 0; i < ${#chars}; i++)); do
    c="${chars:$i:1}"
    id=$(printf "%d" "'$c")
    if [ "$c" = " " ]; then
        magick -size "$((size / 4))x$height" xc:none "$work/g$i.png"
    else
        magick -background none -fill white -font "$ttf" -pointsize "$size" label:"$c" -gravity north -extent "x$height" "$work/g$i.png"
    fi
    w=$(magick identify -format "%w" "$work/g$i.png")
    lines+="char id=$id x=$x y=0 width=$w height=$height xoffset=0 yoffset=0 xadvance=$w page=0 chnl=15"$'\n'
    files+=("$work/g$i.png")
    x=$((x + w))
done
# White on black with no alpha, the glyphs' edges in gray levels: with alpha the watch draws them
# heavier than its own fonts.
magick "${files[@]}" -background none +append -background black -alpha remove -colorspace gray "$out/time.png"
{
    echo "info face=\"time\" size=$size bold=0 italic=0 charset=\"\" unicode=1 stretchH=100 smooth=1 aa=1 padding=0,0,0,0 spacing=0,0"
    echo "common lineHeight=$height base=$((height * 4 / 5)) scaleW=$x scaleH=$height pages=1 packed=0"
    echo "page id=0 file=\"time.png\""
    echo "chars count=${#chars}"
    printf "%s" "$lines"
} > "$out/time.fnt"
echo "$out: ${size}px, ${x}x$height"
