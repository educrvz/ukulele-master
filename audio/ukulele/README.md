# Recorded ukulele bank

Source: [FreePats ukulele1](https://github.com/freepats/ukulele1), version 2026-08-11, recorded by Mateusz Dąbrowski. License: CC0 1.0; full dedication in `LICENSE.txt`.

The 13 pitched FLAC samples and two percussion samples were converted to mono 44.1 kHz, 160 kb/s MP3 with ffmpeg for browser playback and offline installation. Root pitches and cent offsets follow `Ukulele 20260811.sfz` in the source repository. The bank is sampled from C4 to C6; notes beyond that range use the nearest sample with pitch shift. The synthesizer in `js/audio.js` is used only if sample loading fails.
