#!/bin/sh
# Re-encode a source recording for the game: mono, loudness-normalised, 64 kbps MP3 with short fades.
# Usage: scripts/encode-music.sh <input> <output.mp3>
set -e
d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$1")
st=$(awk "BEGIN{v=$d-1.5; print (v<0)?0:v}")
ffmpeg -hide_banner -loglevel error -y -i "$1" -vn -map_metadata -1 -ac 1 \
  -af "afade=t=in:d=0.3,afade=t=out:st=$st:d=1.5,loudnorm=I=-18:TP=-2,aresample=44100" \
  -c:a libmp3lame -b:a 64k "$2"
