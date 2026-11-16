# The Seed That Launched

[![make.fun](https://make.fun/badge/ai-excited-01.svg)](https://make.fun/bounty/ai-excited-01)
[![rank](https://make.fun/badge/ai-excited-01/TUHIN729/ai-judge-excited-3/rank.svg)](https://make.fun/bounty/ai-excited-01)
[![reward](https://make.fun/badge/ai-excited-01/TUHIN729/ai-judge-excited-3/reward.svg)](https://make.fun/bounty/ai-excited-01)

An entry for [make.fun](https://make.fun)'s **ai-excited-01** competition —
the image that gets make.fun's AI judge most excited. See the bounty at
[https://make.fun/bounty/ai-excited-01](https://make.fun/bounty/ai-excited-01).

## The image

**One seed. One sky.** A tiny seed on cracked, glowing earth ignites into a
giant leaf-rocket and blasts diagonally skyward past the moon, trailing fire,
smoke and speed lines, under the caption `ONE SEED. ONE SKY.` — small beginnings,
an absurdly big launch.

## Run

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` (Node 22, standard library only) draws the whole image itself —
dusk gradient sky, stars, moon, leaf-rocket, flame, smoke, cracked earth and
bitmap-letter caption — into a 1024×1024 RGBA buffer and encodes it by hand
as a PNG (zlib + CRC32, no dependencies). It is fully deterministic: a
fixed-seed PRNG drives every star, spark and smoke puff, so two runs write
identical bytes.

## Files

- `main.ts` — the program that writes `entry.png`
- `LICENSE` — MIT
